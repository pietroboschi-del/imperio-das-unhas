import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class PublicBookingDto {
 @IsString() @IsNotEmpty() @MaxLength(128) unitId!:string;
 @IsString() @IsNotEmpty() @MaxLength(128) serviceId!:string;
 @IsString() @IsNotEmpty() @MaxLength(128) professionalId!:string;
 @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/) startAt!:string;
 @IsString() @IsNotEmpty() @MaxLength(160) clientName!:string;
 @IsString() @IsNotEmpty() @MaxLength(40) clientPhone!:string;
 @IsOptional() @IsEmail() @MaxLength(200) clientEmail?:string;
}
