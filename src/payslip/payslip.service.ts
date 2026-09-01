import { Injectable, NotFoundException, BadGatewayException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayslipService {
  constructor(private readonly prisma: PrismaService) {}

  async list(employeeNrp: string) {
    const slips = await this.prisma.payslip.findMany({
      where: { employeeNrp },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return slips.map((s) => ({
      id: s.id,
      year: s.year,
      month: s.month,
      codeFile: s.codeFile,
      fileUrl: s.fileUrl,
    }));
  }

  async getById(id: number, employeeNrp: string) {
    const slip = await this.prisma.payslip.findFirst({
      where: { id, employeeNrp },
    });
    if (!slip) throw new NotFoundException('Slip tidak ditemukan');
    return slip;
  }

  async fetchPdf(url: string | null): Promise<Buffer> {
    if (!url) {
      throw new NotFoundException('File slip tidak tersedia');
    }
    try {
      const token = process.env.ASSETS_API_TOKEN;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: token ? { 'X-API-Token': token } : undefined,
      });
      if (!res.ok) {
        throw new NotFoundException('File slip tidak ditemukan di server assets');
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw new BadGatewayException('Gagal mengambil file slip dari server assets');
    }
  }
}
