import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  nrp: string;

  @IsString()
  @IsNotEmpty()
  credential: string; // NIK (login pertama) atau PIN
}
