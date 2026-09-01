import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class GabunganFieldDto {
  @IsString()
  @IsNotEmpty()
  fieldShowCode: string;

  @IsOptional()
  @IsString()
  splitBy?: string;

  @IsOptional()
  @IsInt()
  sort?: number;
}

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsInt()
  level?: number;

  @IsOptional()
  @IsInt()
  sort?: number;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsOptional()
  @IsString()
  sourceEntityCode?: string;

  @IsOptional()
  @IsString()
  sourceFieldCode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GabunganFieldDto)
  gabungan?: GabunganFieldDto[];
}
