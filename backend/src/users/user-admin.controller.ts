import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { NetworkAdmin } from '../common/network-admin.decorator';
import { UserAdminService } from './user-admin.service';

class UnitAccessDto{
  @IsString() unitId!:string;
  @IsString() role!:string;
  @IsOptional() @IsArray() permissions?:string[];
}
class CreateUserDto{
  @IsString() @MinLength(2) username!:string;
  @IsString() @MinLength(2) displayName!:string;
  @IsOptional() @IsBoolean() active?:boolean;
  @IsOptional() @IsIn(['ADMINISTRATIVE','OPERATOR']) systemRole?:'ADMINISTRATIVE'|'OPERATOR';
  @IsOptional() @IsArray() permissions?:string[];
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(()=>UnitAccessDto) units?:UnitAccessDto[];
}
class UpdateUserAccessDto{
  @IsOptional() @IsString() @MinLength(2) username?:string;
  @IsOptional() @IsString() @MinLength(2) displayName?:string;
  @IsOptional() @IsBoolean() active?:boolean;
  @IsOptional() @IsIn(['ADMINISTRATIVE','OPERATOR']) systemRole?:'ADMINISTRATIVE'|'OPERATOR';
  @IsOptional() @IsArray() permissions?:string[];
  @IsOptional() @IsArray() @ValidateNested({each:true}) @Type(()=>UnitAccessDto) units?:UnitAccessDto[];
}

@Controller('api/v1/admin/users')
@NetworkAdmin()
export class UserAdminController{
  constructor(private readonly users:UserAdminService){}
  @Get() list(){return this.users.list();}
  @Post() create(@Body() dto:CreateUserDto){return this.users.create(dto.username,dto.displayName,dto);}
  @Patch(':id/access') update(@Param('id') id:string,@Body() dto:UpdateUserAccessDto){return this.users.updateAccess(id,dto);}
}
