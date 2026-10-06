import { IsEmail, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
