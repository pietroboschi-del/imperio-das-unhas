import { Type } from 'class-transformer';
import { ArrayMinSize, IsBoolean, IsEmail, IsISO8601, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

export class CreateClientDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(20) cpf?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string;
  @IsOptional() @IsString() @MaxLength(20) cep?: string;
  @IsOptional() @IsString() @MaxLength(160) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(160) city?: string;
  @IsOptional() @IsString() @MaxLength(160) profession?: string;
  @IsOptional() @IsString() @MaxLength(160) source?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateClientDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(20) cpf?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?: string;
  @IsOptional() @IsString() @MaxLength(20) cep?: string;
  @IsOptional() @IsString() @MaxLength(160) neighborhood?: string;
  @IsOptional() @IsString() @MaxLength(160) city?: string;
  @IsOptional() @IsString() @MaxLength(160) profession?: string;
  @IsOptional() @IsString() @MaxLength(160) source?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class BookingItemWriteDto {
  @IsString() @IsNotEmpty() @MaxLength(128) serviceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(128) professionalId!: string;
  @IsISO8601({strict:true}) startAt!: string;
  @IsOptional() @IsInt() @Min(1) durationMin?: number;
  @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) unitPrice?: number;
  @IsOptional() @IsBoolean() preference?: boolean;
  @IsOptional() @IsBoolean() forceFit?: boolean;
}

const BOOKING_STATUSES=['Agendado','Aguardando confirmação','Confirmado','Em atendimento','Concluído','Faltou','Cancelado','Encaixe'] as const;

export class CreateBookingDto {
  @IsOptional() @IsString() @MaxLength(128) clientId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(128) serviceId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(128) professionalId?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate!: string;
  @IsOptional() @IsISO8601({strict:true}) startAt?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsIn(BOOKING_STATUSES) status?: string;
  @IsOptional() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>BookingItemWriteDto) items?: BookingItemWriteDto[];
}

export class UpdateBookingDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsIn(BOOKING_STATUSES) status?: string;
  @IsOptional() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>BookingItemWriteDto) items?: BookingItemWriteDto[];
}
