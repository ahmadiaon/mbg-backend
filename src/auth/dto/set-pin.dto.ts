import { IsNotEmpty, IsString, Length } from 'class-validator';

export class SetPinDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @Length(6, 6, { message: 'PIN harus 6 digit' })
  pin: string;
}
