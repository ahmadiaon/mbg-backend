import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEntityDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  menu?: string;

  @IsOptional()
  @IsString()
  parentCode?: string;

  @IsOptional()
  @IsString()
  primaryCode?: string;
}
