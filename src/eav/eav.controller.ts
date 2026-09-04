import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { EavService } from './eav.service';
import { CreateEntityDto } from './dto/create-entity.dto';
import { UpdateEntityDto } from './dto/update-entity.dto';
import { CreateFieldDto } from './dto/create-field.dto';
import { UpdateFieldDto } from './dto/update-field.dto';
import { StoreRecordDto } from './dto/store-record.dto';
import { AssetsService } from '../assets/assets.service';
import { EffectiveAccessService } from '../authority/effective-access.service';
import { AuthorityAdminGuard } from '../authority/authority-admin.guard';

@Controller('eav')
@UseGuards(JwtAuthGuard)
export class EavController {
  constructor(
    private readonly eav: EavService,
    private readonly assets: AssetsService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get('builder')
  builder(
    @Query('table') table?: string,
    @Query('record') record?: string,
  ) {
    return this.eav.buildSession(table, record);
  }

  @Get('entities')
  entities() {
    return this.eav.getEntities();
  }

  @Post('entities')
  @UseGuards(AuthorityAdminGuard)
  createEntity(@Body() dto: CreateEntityDto) {
    return this.eav.createEntity(dto);
  }

  @Put('entities/:code')
  @UseGuards(AuthorityAdminGuard)
  updateEntity(@Param('code') code: string, @Body() dto: UpdateEntityDto) {
    return this.eav.updateEntity(code, dto);
  }

  @Delete('entities/:code')
  @UseGuards(AuthorityAdminGuard)
  deleteEntity(@Param('code') code: string) {
    return this.eav.deleteEntity(code);
  }

  @Get('entities/:code/fields')
  fields(@Param('code') code: string) {
    return this.eav.getEntityByCode(code);
  }

  @Post('entities/:code/fields')
  @UseGuards(AuthorityAdminGuard)
  createField(@Param('code') code: string, @Body() dto: CreateFieldDto) {
    return this.eav.createField(code, dto);
  }

  @Put('entities/:code/fields/:fieldCode')
  @UseGuards(AuthorityAdminGuard)
  updateField(
    @Param('code') code: string,
    @Param('fieldCode') fieldCode: string,
    @Body() dto: UpdateFieldDto,
  ) {
    return this.eav.updateField(code, fieldCode, dto);
  }

  @Delete('entities/:code/fields/:fieldCode')
  @UseGuards(AuthorityAdminGuard)
  deleteField(
    @Param('code') code: string,
    @Param('fieldCode') fieldCode: string,
  ) {
    return this.eav.deleteField(code, fieldCode);
  }

  @Get('entities/:code/records')
  async records(@Param('code') code: string, @Req() req: Request) {
    const user = req['user'] as JwtPayload;
    await this.access.assertAccess(user.sub, 'DATABASE', 'read');
    return this.eav.getRecords(code);
  }

  @Get('entities/:code/records/:recordCode/family')
  family(@Param('code') code: string, @Param('recordCode') recordCode: string) {
    return this.eav.getRecordFamily(code, recordCode);
  }

  @Get('entities/:code/records/:recordCode/history')
  history(@Param('code') code: string, @Param('recordCode') recordCode: string) {
    return this.eav.getRecordHistory(code, recordCode);
  }

  @Get('change-types/:tableCode')
  changeTypes(@Param('tableCode') tableCode: string) {
    return this.eav.getChangeTypes(tableCode);
  }

  @Get('entities/:code/records/:recordCode/combined/:fieldCode')
  combined(
    @Param('code') code: string,
    @Param('recordCode') recordCode: string,
    @Param('fieldCode') fieldCode: string,
  ) {
    return this.eav.getCombinedValue(code, recordCode, fieldCode).then((value) => ({ value }));
  }

  @Post('entities/:code/records/:recordCode/correction')
  correction(@Param('code') code: string, @Param('recordCode') recordCode: string, @Body('values') values: Record<string, string>, @Req() req: Request) {
    const user = req['user'] as JwtPayload;
    return this.access.assertAccess(user.sub, 'HISTORICAL-DATA', 'edit').then(() =>
      this.eav.correctRecord(code, recordCode, values || {}, user.sub),
    );
  }

  @Post('entities/:code/records/:recordCode/historical-update')
  historicalUpdate(
    @Param('code') code: string,
    @Param('recordCode') recordCode: string,
    @Body() body: { changeTypeCode: string; values: Record<string, string> },
    @Req() req: Request,
  ) {
    const user = req['user'] as JwtPayload;
    return this.access.assertAccess(user.sub, 'HISTORICAL-DATA', 'submit').then(() =>
      this.eav.createHistoricalChange(code, recordCode, body.changeTypeCode, body.values || {}, user.sub),
    );
  }

  @Post('historical-changes/:id/approve')
  approveHistorical(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'] as JwtPayload;
    return this.access.assertAccess(user.sub, 'HISTORICAL-DATA', 'approve').then(() =>
      this.eav.approveHistoricalChange(Number(id), user.sub),
    );
  }

  @Post('historical-changes/:id/reject')
  rejectHistorical(@Param('id') id: string, @Req() req: Request) {
    const user = req['user'] as JwtPayload;
    return this.access.assertAccess(user.sub, 'HISTORICAL-DATA', 'reject').then(() =>
      this.eav.rejectHistoricalChange(Number(id), user.sub),
    );
  }

  @Post('entities/:code/records')
  async storeRecord(@Param('code') code: string, @Body() dto: StoreRecordDto, @Req() req: Request) {
    const user = req['user'] as JwtPayload;
    await this.access.assertAccess(user.sub, 'DATABASE', 'write');
    return this.eav.storeRecord(code, dto);
  }

  @Delete('entities/:code/records/:recordCode')
  async deleteRecord(
    @Param('code') code: string,
    @Param('recordCode') recordCode: string,
    @Req() req: Request,
  ) {
    const user = req['user'] as JwtPayload;
    await this.access.assertAccess(user.sub, 'DATABASE', 'delete');
    return this.eav.deleteRecord(code, recordCode);
  }

  @Get('entities/:code/export')
  async exportRecords(@Param('code') code: string, @Res() res: Response, @Req() req: Request) {
    const user = req['user'] as JwtPayload;
    await this.access.assertAccess(user.sub, 'DATABASE', 'export');
    const { filename, buffer } = await this.eav.exportRecords(code);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.send(buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importRecords(@UploadedFile() file: { buffer: Buffer }, @Req() req: Request) {
    if (!file) throw new Error('File tidak ditemukan');
    const user = req['user'] as JwtPayload;
    await this.access.assertAccess(user.sub, 'DATABASE', 'import');
    return this.eav.importRecords(file.buffer);
  }

  @Post('assets/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAsset(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
    @Body('folder') folder?: string,
    @Body('filename') filename?: string,
  ) {
    if (!file) throw new Error('File tidak ditemukan');
    return this.assets.upload(file, folder || 'eav', filename);
  }
}
