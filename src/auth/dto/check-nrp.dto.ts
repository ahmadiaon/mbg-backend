import { IsNotEmpty, IsString } from 'class-validator';

export class CheckNrpDto {
  @IsString()
  @IsNotEmpty()
  nrp: string;
}
