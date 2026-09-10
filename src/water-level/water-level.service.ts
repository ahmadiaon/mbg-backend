import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetsService } from '../assets/assets.service';
import { EffectiveAccessService } from '../authority/effective-access.service';
import { CreateWaterLevelDto } from './dto/create-water-level.dto';

export interface UploadedFileDto {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  buffer: Buffer;
  size?: number;
}

export interface WaterLevelRecord {
  id: number;
  tanggal: string; // YYYY-MM-DD
  jam: string;
  tinggi: number;
  lokasi: string;
  foto_panorama: string | null;
  foto_draft_meter: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WaterLevelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetsService: AssetsService,
    private readonly effectiveAccess: EffectiveAccessService,
  ) {}

  private formatDateStr(d: Date): string {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private transformRecord(row: {
    id: number;
    tanggal: Date;
    jam: string;
    tinggi: number;
    lokasi: string;
    fotoPanorama: string | null;
    fotoDraftMeter: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): WaterLevelRecord {
    return {
      id: row.id,
      tanggal: this.formatDateStr(row.tanggal),
      jam: row.jam,
      tinggi: row.tinggi,
      lokasi: row.lokasi,
      foto_panorama: row.fotoPanorama,
      foto_draft_meter: row.fotoDraftMeter,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async getData(lokasi?: string): Promise<WaterLevelRecord[]> {
    const whereClause: Record<string, unknown> = {};
    if (lokasi && lokasi !== 'ALL') {
      whereClause.lokasi = lokasi;
    }

    const rows = await this.prisma.waterLevel.findMany({
      where: whereClause,
      orderBy: [{ tanggal: 'desc' }, { jam: 'desc' }, { id: 'desc' }],
    });

    return rows.map((r) => this.transformRecord(r));
  }

  async getSummary(lokasi?: string) {
    const allRecords = await this.getData();

    const getLatestAndYesterday = (loc: string) => {
      const locRecords = allRecords.filter((r) => r.lokasi === loc);
      const latest = locRecords[0] ?? null;

      if (!latest) {
        return { latest: null, yesterday: null, diff: 0, text: 'Belum ada data', status: 'neutral' as const };
      }

      // Find calendar yesterday date
      const latestDate = new Date(`${latest.tanggal}T00:00:00.000Z`);
      latestDate.setUTCDate(latestDate.getUTCDate() - 1);
      const yesterdayStr = this.formatDateStr(latestDate);

      let yesterday =
        locRecords.find((r) => r.tanggal === yesterdayStr) ?? null;

      // If no measurement on exact calendar yesterday, fallback to most recent prior measurement
      if (!yesterday) {
        yesterday = locRecords.find((r) => r.tanggal < latest.tanggal) ?? null;
      }

      let diff = 0;
      let text = 'Belum ada data kemarin';
      let status: 'up' | 'down' | 'neutral' = 'neutral';

      if (yesterday) {
        diff = Number((latest.tinggi - yesterday.tinggi).toFixed(2));
        if (diff > 0) {
          text = `+${diff} cm dari kemarin`;
          status = 'up';
        } else if (diff < 0) {
          text = `${diff} cm dari kemarin`;
          status = 'down';
        } else {
          text = '0 cm dari kemarin';
          status = 'neutral';
        }
      }

      return {
        latest,
        yesterday,
        diff,
        text,
        status,
      };
    };

    const mb = getLatestAndYesterday('PT. MB');
    const sri = getLatestAndYesterday('PT. SRI');

    // 7-day trend series: Anchor to the latest date of selected location or overall
    const targetRecords =
      lokasi && lokasi !== 'ALL'
        ? allRecords.filter((r) => r.lokasi === lokasi)
        : allRecords;

    const anchorDateStr =
      targetRecords.length > 0
        ? targetRecords[0].tanggal
        : this.formatDateStr(new Date());

    const anchorDate = new Date(`${anchorDateStr}T00:00:00.000Z`);
    const dates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchorDate);
      d.setUTCDate(anchorDate.getUTCDate() - i);
      dates.push(this.formatDateStr(d));
    }

    const trend = dates.map((date) => {
      const dayData = allRecords.filter((r) => r.tanggal === date);
      const mbRow = dayData.find((r) => r.lokasi === 'PT. MB');
      const sriRow = dayData.find((r) => r.lokasi === 'PT. SRI');

      return {
        date,
        mb: mbRow ? mbRow.tinggi : null,
        mbTime: mbRow ? mbRow.jam : null,
        sri: sriRow ? sriRow.tinggi : null,
        sriTime: sriRow ? sriRow.jam : null,
      };
    });

    return {
      mb,
      sri,
      trend,
    };
  }

  async create(
    userId: number,
    dto: CreateWaterLevelDto,
    files?: {
      foto_panorama?: UploadedFileDto[];
      foto_draft_meter?: UploadedFileDto[];
    },
  ) {
    // Assert write access
    await this.effectiveAccess.assertAccess(userId, 'WATER-LEVEL', 'write');

    let fotoPanorama: string | null = null;
    let fotoDraftMeter: string | null = null;

    if (files?.foto_panorama?.[0]) {
      const file = files.foto_panorama[0];
      const ext = file.originalname.split('.').pop() || 'jpg';
      const filename = `panorama_${dto.tanggal.replace(/-/g, '')}_${dto.jam.replace(/:/g, '')}_${Date.now()}.${ext}`;
      const uploadResult = (await this.assetsService.upload(
        {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
        },
        'water_level/panorama',
        filename,
      )) as { success: boolean; url: string; filename?: string };
      fotoPanorama = uploadResult.filename || filename;
    }

    if (files?.foto_draft_meter?.[0]) {
      const file = files.foto_draft_meter[0];
      const ext = file.originalname.split('.').pop() || 'jpg';
      const filename = `draft_meter_${dto.tanggal.replace(/-/g, '')}_${dto.jam.replace(/:/g, '')}_${Date.now()}.${ext}`;
      const uploadResult = (await this.assetsService.upload(
        {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
        },
        'water_level/draft_meter',
        filename,
      )) as { success: boolean; url: string; filename?: string };
      fotoDraftMeter = uploadResult.filename || filename;
    }

    const record = await this.prisma.waterLevel.create({
      data: {
        tanggal: new Date(`${dto.tanggal}T00:00:00.000Z`),
        jam: dto.jam,
        lokasi: dto.lokasi,
        tinggi: Number(dto.tinggi),
        fotoPanorama,
        fotoDraftMeter,
      },
    });

    return this.transformRecord(record);
  }

  async delete(userId: number, id: number) {
    const userRole = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    const isSuperUser = (userRole?.role ?? 1) >= 14;
    const canDelete =
      isSuperUser ||
      (await this.effectiveAccess.canPerform(userId, 'WATER-LEVEL', 'delete'));

    if (!canDelete) {
      throw new ForbiddenException(
        'Akses ditolak: Anda tidak memiliki izin untuk menghapus data water level.',
      );
    }

    const existing = await this.prisma.waterLevel.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Data water level tidak ditemukan');
    }

    await this.prisma.waterLevel.delete({
      where: { id },
    });

    return { success: true, message: 'Data water level berhasil dihapus' };
  }
}
