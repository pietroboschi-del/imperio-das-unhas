import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsISO8601, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

export class WhatsappAgentBookingDto {
 @IsString() @IsNotEmpty() @MaxLength(128) unitId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) date!:string;
 @IsString() @IsNotEmpty() @MaxLength(128) serviceId!:string;
 @IsString() @IsNotEmpty() @MaxLength(128) professionalId!:string;
 @IsISO8601({strict:true}) startAt!:string;

 @IsOptional() @IsString() @MaxLength(128) clientId?:string;
 @IsOptional() @IsString() @MaxLength(160) clientName?:string;
 @IsOptional() @IsString() @MaxLength(40) clientPhone?:string;
 @IsOptional() @IsEmail() @MaxLength(200) clientEmail?:string;

 @IsOptional() @IsString() @MaxLength(64) channelId?:string;
}

export class WhatsappAgentMultiServiceSpecDto {
 @IsString() @IsNotEmpty() @MaxLength(128) serviceId!:string;
 @IsOptional() @IsString() @MaxLength(128) professionalId?:string;
 @IsOptional() @IsIn(['preferred','required']) preferenceMode?:'preferred'|'required';
}

export class WhatsappAgentMultiAvailabilityDto {
 @IsString() @IsNotEmpty() @MaxLength(128) unitId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) date!:string;
 @IsArray() @ArrayMinSize(2) @ArrayMaxSize(5)
 @ValidateNested({each:true}) @Type(()=>WhatsappAgentMultiServiceSpecDto)
 services!:WhatsappAgentMultiServiceSpecDto[];
}

export class WhatsappAgentMultiBookingItemDto {
 @IsString() @IsNotEmpty() @MaxLength(128) serviceId!:string;
 @IsString() @IsNotEmpty() @MaxLength(128) professionalId!:string;
 @IsISO8601({strict:true}) startAt!:string;
}

export class WhatsappAgentMultiBookingDto {
 @IsString() @IsNotEmpty() @MaxLength(128) unitId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) date!:string;

 @IsArray() @ArrayMinSize(2) @ArrayMaxSize(5)
 @ValidateNested({each:true}) @Type(()=>WhatsappAgentMultiServiceSpecDto)
 services!:WhatsappAgentMultiServiceSpecDto[];

 @IsArray() @ArrayMinSize(2) @ArrayMaxSize(5)
 @ValidateNested({each:true}) @Type(()=>WhatsappAgentMultiBookingItemDto)
 items!:WhatsappAgentMultiBookingItemDto[];

 @IsOptional() @IsString() @MaxLength(128) clientId?:string;
 @IsOptional() @IsString() @MaxLength(160) clientName?:string;
 @IsOptional() @IsString() @MaxLength(40) clientPhone?:string;
 @IsOptional() @IsEmail() @MaxLength(200) clientEmail?:string;
 @IsOptional() @IsString() @MaxLength(64) channelId?:string;
}
