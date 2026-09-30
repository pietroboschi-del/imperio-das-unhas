import { IsEmail, IsISO8601, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateClientDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
}

export class CreateBookingDto {
  @IsOptional() @IsString() @MaxLength(128) clientId?: string;
  @IsString() @IsNotEmpty() @MaxLength(128) serviceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(128) professionalId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate!: string;
  @IsISO8601({strict:true}) startAt!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsIn(['Agendado','Confirmado','Encaixe']) status?: string;
}
