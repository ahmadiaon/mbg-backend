import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { PayslipService } from './payslip.service';

@Controller('payslips')
@UseGuards(JwtAuthGuard)
export class PayslipController {
  constructor(private readonly payslip: PayslipService) {}

  @Get()
  list(@Req() req: Request) {
    const user = req['user'] as JwtPayload;
    return this.payslip.list(user.nrp);
  }

  @Get(':id/file')
  async file(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req['user'] as JwtPayload;
    const slip = await this.payslip.getById(id, user.nrp);
    const pdf = await this.payslip.fetchPdf(slip.fileUrl);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }

  @Get(':id/download')
  async download(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req['user'] as JwtPayload;
    const slip = await this.payslip.getById(id, user.nrp);
    const pdf = await this.payslip.fetchPdf(slip.fileUrl);
    const filename = `SLIP-${slip.year}-${String(slip.month).padStart(2, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }
}
