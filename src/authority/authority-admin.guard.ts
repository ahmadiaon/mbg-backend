import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthorityAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const payload = request.user as { sub?: number } | undefined;
    if (!payload?.sub) throw new UnauthorizedException('Identitas user tidak ditemukan');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, nrp: true, role: true, active: true },
    });
    if (!user?.active) throw new UnauthorizedException('Akun tidak aktif');
    if (user.role !== 14 && user.role !== 15) {
      throw new ForbiddenException('Hanya Super User yang boleh mengatur otoritas');
    }
    if (user.role === 15 && user.nrp !== 'MBLE-0422003') {
      throw new ForbiddenException('Pemilik Super User Utama tidak valid');
    }

    request.authorityUser = user;
    return true;
  }
}
