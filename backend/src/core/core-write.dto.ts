import { IsArray, IsBoolean, IsEmail, IsISO8601, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateClientDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
}

export class BookingItemDto {
  @IsString() @IsNotEmpty() @MaxLength(128) serviceId!: string;
  @IsString() @IsNotEmpty() @MaxLength(128) professionalId!: string;
  @IsISO8601({strict:true}) startAt!: string;
  @IsOptional() @IsNumber() durationMin?: number;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsBoolean() preference?: boolean;
  @IsOptional() @IsBoolean() forceFit?: boolean;
}

export class CreateBookingDto {
  @IsOptional() @IsString() @MaxLength(128) clientId?: string;
  @IsOptional() @IsString() @MaxLength(128) serviceId?: string;
  @IsOptional() @IsString() @MaxLength(128) professionalId?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate!: string;
  @IsOptional() @IsISO8601({strict:true}) startAt?: string;
  @IsOptional() @IsArray() items?: BookingItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsIn(['Agendado','Confirmado','Encaixe','Aguardando confirmação']) status?: string;
}

export class UpdateBookingDto {
  @IsOptional() @IsString() @MaxLength(128) clientId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate?: string;
  @IsOptional() @IsArray() items?: BookingItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsIn(['Agendado','Aguardando confirmação','Confirmado','Em atendimento','Concluído','Cancelado','Faltou','Encaixe']) status?: string;
}
