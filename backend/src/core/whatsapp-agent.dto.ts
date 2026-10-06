import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsISO8601, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';

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

export class WhatsappAgentWaitlistServiceDto {
 @IsString() @IsNotEmpty() @MaxLength(128) serviceId!:string;
 @IsOptional() @IsString() @MaxLength(128) professionalId?:string;
 @IsOptional() @IsIn(['preferred','required']) preferenceMode?:'preferred'|'required';
}

export class WhatsappAgentWaitlistDto {
 @IsString() @IsNotEmpty() @MaxLength(128) unitId!:string;
 @IsOptional() @IsString() @MaxLength(128) clientId?:string;
 @IsOptional() @IsString() @MaxLength(160) clientName?:string;
 @IsOptional() @IsString() @MaxLength(40) clientPhone?:string;
 @IsOptional() @IsEmail() @MaxLength(200) clientEmail?:string;

 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5)
 @ValidateNested({each:true}) @Type(()=>WhatsappAgentWaitlistServiceDto)
 services!:WhatsappAgentWaitlistServiceDto[];

 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) desiredDate?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) desiredDateFrom?:string;
 @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) desiredDateTo?:string;
 @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) timeFrom?:string;
 @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) timeTo?:string;

 @IsBoolean() acceptsOtherProfessional!:boolean;
 @IsBoolean() acceptsOtherUnits!:boolean;
 @IsOptional() @IsString() @MaxLength(500) note?:string;
 @IsOptional() @IsString() @MaxLength(64) channelId?:string;
 @IsOptional() @IsString() @MaxLength(160) conversationRef?:string;
 @IsOptional() @IsString() @MaxLength(160) messageRef?:string;
}
