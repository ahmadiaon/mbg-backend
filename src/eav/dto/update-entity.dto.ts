import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateEntityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  menu?: string;

  @IsOptional()
  @IsString()
  parentCode?: string;

  @IsOptional()
  @IsString()
  primaryCode?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  persetujuan?: Array<{
    level: string;
    grade?: string;
    group?: string;
    description?: string;
    reference?: string;
  }>;
}
