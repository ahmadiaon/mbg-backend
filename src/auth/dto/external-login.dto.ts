import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ExternalLoginDto {
  @IsString()
  @IsNotEmpty()
  nrp: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'PIN harus 6 digit' })
  pin: string;
}
