import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CheckNrpDto } from './dto/check-nrp.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ExternalLoginDto } from './dto/external-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('check')
  check(@Body() dto: CheckNrpDto) {
    return this.authService.checkNrp(dto.nrp);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('external-login')
  externalLogin(@Body() dto: ExternalLoginDto) {
    return this.authService.externalLogin(dto);
  }

  @Get('validation/:token')
  validation(@Param('token') token: string) {
    return this.authService.validateToken(token);
  }

  @Post('set-pin')
  setPin(@Body() dto: SetPinDto) {
    return this.authService.setPin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: Request) {
    return req['user'];
  }
}
