import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class StoreRecordDto {
  @IsString()
  @IsNotEmpty()
  recordCode: string;

  @IsOptional()
  @IsString()
  recordUuid?: string;

  @IsObject()
  values: Record<string, string>;
}
