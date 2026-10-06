import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class WaitlistOpportunityStateDto {
 @IsIn(['CONTACTED','OFFERED','ACCEPTED','DECLINED','EXPIRED','CANCELLED'])
 state!:'CONTACTED'|'OFFERED'|'ACCEPTED'|'DECLINED'|'EXPIRED'|'CANCELLED';
}

export class WaitlistConvertDto {
 @IsString() @IsNotEmpty() @MaxLength(128) bookingId!:string;
}
