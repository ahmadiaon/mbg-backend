import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { JwtPayload } from './jwt-auth.guard';
import { ExternalLoginDto } from './dto/external-login.dto';
import { EffectiveAccessService } from '../authority/effective-access.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly accessService: EffectiveAccessService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { nrp: dto.nrp },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('NRP tidak ditemukan atau akun nonaktif');
    }

    // Sudah punya PIN -> login PIN langsung
    if (user.pin) {
      const ok = await bcrypt.compare(dto.credential, user.pin);
      if (!ok) throw new UnauthorizedException('PIN salah');

      const payload: JwtPayload = {
        sub: user.id,
        nrp: user.nrp,
        role: user.role,
      };
      const token = await this.jwtService.signAsync(payload);

      return {
        status: 'success',
        token,
        user: {
          id: user.id,
          nrp: user.nrp,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    }

    // Belum punya PIN -> login NIK -> butuh verifikasi WhatsApp
    if (!user.password) {
      throw new UnauthorizedException('Akun belum memiliki password');
    }
    const ok = await bcrypt.compare(dto.credential, user.password);
    if (!ok) throw new UnauthorizedException('NIK salah');

    // Token validasi 8 karakter (sama seperti sistem lama)
    const validationToken = createHash('sha256')
      .update(user.nrp)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { authLogin: validationToken },
    });

    return {
      status: 'need_verification',
      nrp: user.nrp,
      name: user.name,
      validationToken,
      waNumber: process.env.WA_ADMIN_NUMBER ?? '6281255897044',
    };
  }

  async externalLogin(dto: ExternalLoginDto) {
    const user = await this.prisma.user.findUnique({ where: { nrp: dto.nrp } });
    if (!user || !user.active || !user.pin || !(await bcrypt.compare(dto.pin, user.pin))) {
      throw new UnauthorizedException('NRP atau PIN salah');
    }
    const access = await this.accessService.resolveEffectiveAccess(user.id);
    const token = await this.jwtService.signAsync({ sub: user.id, nrp: user.nrp, role: user.role, audience: 'external' });
    return {
      status: 'success',
      accessToken: token,
      tokenType: 'Bearer',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
      user: access.user,
      authority: {
        roleLevels: access.roleLevels,
        statuses: access.statuses,
        features: access.features,
      },
    };
  }

  // Verifikasi token validasi (dibuka karyawan dari link WhatsApp)
  async validateToken(token: string) {
    const user = await this.prisma.user.findFirst({
      where: { authLogin: token },
    });
    if (!user) return { found: false, nrp: '', name: '' };
    return { found: true, nrp: user.nrp, name: user.name };
  }

  async setPin(dto: SetPinDto) {
    const user = await this.prisma.user.findFirst({
      where: { authLogin: dto.token },
    });
    if (!user) {
      throw new UnauthorizedException('Token tidak valid atau sudah digunakan');
    }

    const pin = await bcrypt.hash(dto.pin, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { pin, authLogin: null },
    });
    return { message: 'PIN berhasil dibuat' };
  }

  // Cek NRP: ada/tidak + pakai PIN atau NIK
  async checkNrp(nrp: string) {
    const user = await this.prisma.user.findUnique({ where: { nrp } });
    if (!user || !user.active) {
      return { found: false, isPin: false, name: '' };
    }
    return { found: true, isPin: !!user.pin, name: user.name };
  }
}
