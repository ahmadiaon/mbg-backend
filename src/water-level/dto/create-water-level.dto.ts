import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateWaterLevelDto {
  @IsNotEmpty()
  @IsString()
  tanggal: string; // YYYY-MM-DD

  @IsNotEmpty()
  @IsString()
  jam: string; // HH:mm

  @IsNotEmpty()
  @IsString()
  lokasi: string; // 'PT. MB' | 'PT. SRI'

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  tinggi: number;

  @IsOptional()
  @IsString()
  cuaca?: string;
}
