import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtAuthGuard, JwtPayload } from '../auth/jwt-auth.guard';
import { WaterLevelService, UploadedFileDto } from './water-level.service';
import { CreateWaterLevelDto } from './dto/create-water-level.dto';

@Controller('feature/water-level')
@UseGuards(JwtAuthGuard)
export class WaterLevelController {
  constructor(private readonly waterLevelService: WaterLevelService) {}

  @Get('data')
  async getData(@Query('lokasi') lokasi?: string) {
    const data = await this.waterLevelService.getData(lokasi);
    return {
      success: true,
      data,
    };
  }

  @Get('summary')
  async getSummary() {
    const summary = await this.waterLevelService.getSummary();
    return {
      success: true,
      data: summary,
    };
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'foto_panorama', maxCount: 1 },
      { name: 'foto_draft_meter', maxCount: 1 },
    ]),
  )
  async create(
    @Req() req: Request,
    @Body() dto: CreateWaterLevelDto,
    @UploadedFiles()
    files: {
      foto_panorama?: UploadedFileDto[];
      foto_draft_meter?: UploadedFileDto[];
    },
  ) {
    const user = req['user'] as JwtPayload;
    const data = await this.waterLevelService.create(user.sub, dto, files);
    return {
      success: true,
      message: 'Data water level berhasil disimpan.',
      data,
    };
  }

  @Delete(':id')
  async delete(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req['user'] as JwtPayload;
    return this.waterLevelService.delete(user.sub, id);
  }
}
