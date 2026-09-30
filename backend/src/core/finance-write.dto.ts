import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class OpenCashDto {
 @Matches(/^\d{4}-\d{2}-\d{2}$/) businessDate!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) openingAmount!:number;
}
export class CloseCashDto {
 @IsNumber({maxDecimalPlaces:2}) @Min(0) closingAmount!:number;
}
export class CreateCommandDto {
 @IsOptional() @IsString() @MaxLength(128) clientId?:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) grossAmount!:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) discountAmount?:number;
}
export class ReceivePaymentDto {
 @IsString() @IsNotEmpty() @MaxLength(128) cashSessionId!:string;
 @IsIn(['CASH','PIX','DEBIT_CARD','CREDIT_CARD','TRANSFER','OTHER']) method!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) amount!:number;
}

export class AddCommandServiceDto {
 @IsString() @IsNotEmpty() @MaxLength(128) serviceId!:string;
 @IsString() @IsNotEmpty() @MaxLength(128) professionalId!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) unitPrice!:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) discountAmount?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) commissionPercent?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) commissionFixedAmount?:number;
}

export class SettleProfessionalDto {
 @IsString() @IsNotEmpty() @MaxLength(128) professionalId!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) amount!:number;
}
