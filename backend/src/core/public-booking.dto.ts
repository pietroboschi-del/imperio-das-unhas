import { Type } from 'class-transformer';
import { ArrayMinSize, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export class PublicBookingItemDto {
 @IsString() @IsNotEmpty() @MaxLength(128) serviceId!:string;
 @IsString() @IsNotEmpty() @MaxLength(128) professionalId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/) startAt!:string;
}
export class PublicBookingDto {
 @IsString() @IsNotEmpty() @MaxLength(128) unitId!:string;
 @IsOptional() @IsString() @MaxLength(128) serviceId?:string;
 @IsOptional() @IsString() @MaxLength(128) professionalId?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/) startAt?:string;
 @IsOptional() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>PublicBookingItemDto) items?:PublicBookingItemDto[];
 @IsString() @IsNotEmpty() @MaxLength(160) clientName!:string;
 @IsString() @IsNotEmpty() @MaxLength(40) clientPhone!:string;
 @IsOptional() @IsEmail() @MaxLength(200) clientEmail?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) birthDate?:string;
 @IsOptional() @IsString() @MaxLength(20) cpf?:string;
 @IsOptional() @IsString() @MaxLength(20) cep?:string;
 @IsOptional() @IsString() @MaxLength(160) neighborhood?:string;
 @IsOptional() @IsString() @MaxLength(160) city?:string;
 @IsOptional() @IsString() @MaxLength(160) source?:string;
}
