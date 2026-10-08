import { IsArray, IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class OpenCashDto {
 @Matches(/^\d{4}-\d{2}-\d{2}$/) businessDate!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) openingAmount!:number;
}
export class CloseCashDto {
 @IsNumber({maxDecimalPlaces:2}) @Min(0) closingAmount!:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) systemExpected?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) difference?:number;
 @IsOptional() @IsString() @MaxLength(500) closeNote?:string;
 @IsOptional() @IsObject() snapshot?:Record<string,unknown>;
}
export class CreateCommandDto {
 @IsOptional() @IsString() @MaxLength(128) clientId?:string;
 @Matches(/^\d{4}-\d{2}-\d{2}$/) serviceDate!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) grossAmount!:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) discountAmount?:number;
}
export class ReceivePaymentDto {
 @IsOptional() @IsString() @MaxLength(128) professionalId?:string;
 @IsOptional() @IsString() @MaxLength(128) cashSessionId?:string;
 @IsIn(['CASH','PIX','DEBIT_CARD','CREDIT_CARD','TRANSFER','OTHER','DIRECT_PROFESSIONAL','BARTER']) method!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0.01) amount!:number;
 @IsOptional() @IsString() @MaxLength(128) accountId?:string;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) processorFee?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) creditExcessAmount?:number;
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


export type SyncCommandItemDto={serviceId?:string;professionalId?:string;quantity?:number;unitPrice?:number;discountAmount?:number;commissionPercent?:number;commissionFixedAmount?:number};
export class SyncCommandDto{
 @IsNumber({maxDecimalPlaces:2}) @Min(0) grossAmount!:number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) discountAmount!:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) appliedSignalAmount?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) appliedCreditAmount?:number;
 @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) customerFeeAmount?:number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) amountDue!:number;
 @IsOptional() @IsArray() items?:SyncCommandItemDto[];
 @IsOptional() @IsObject() snapshot?:Record<string,unknown>;
}
export class CashAdjustmentDto{
 @IsString() @IsNotEmpty() @MaxLength(80) kind!:string;
 @IsNumber({maxDecimalPlaces:2}) amount!:number;
 @IsOptional() @IsObject() payload?:Record<string,unknown>;
}

export class ReopenCashDto{
 @IsString() @IsNotEmpty() @MaxLength(500) reason!:string;
}
