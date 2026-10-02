import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { sanitizeAssignablePermissions } from '../auth/permission-policy';

export type UserUnitInput={unitId:string;role:string;permissions?:unknown};
export type UserAccessInput={username?:string;displayName?:string;active?:boolean;systemRole?:'ADMINISTRATIVE'|'OPERATOR';permissions?:unknown;units?:UserUnitInput[]};

@Injectable()
export class UserAdminService{
  constructor(private readonly prisma:PrismaService){}

  list(){return this.prisma.user.findMany({
    select:{id:true,legacyId:true,username:true,displayName:true,active:true,networkAdmin:true,systemRole:true,passwordResetRequired:true,permissions:true,createdAt:true,updatedAt:true,unitAccesses:{where:{active:true},select:{unitId:true,role:true,permissions:true,active:true}}},
    orderBy:{displayName:'asc'},
  });}

  private async validateUnits(units:UserUnitInput[]){
    const ids=[...new Set(units.map(x=>String(x.unitId)).filter(Boolean))];
    if(!ids.length)return;
    const found=await this.prisma.unit.count({where:{id:{in:ids},active:true}});
    if(found!==ids.length)throw new ConflictException('Uma ou mais unidades são inválidas/inativas');
  }

  async create(username:string,displayName:string,input:UserAccessInput){
    const cleanUsername=username.trim();if(!cleanUsername)throw new ConflictException('Usuário obrigatório');
    if(await this.prisma.user.findUnique({where:{username:cleanUsername}}))throw new ConflictException('Usuário já existe');
    const units=input.units||[];await this.validateUnits(units);
    const globalPermissions=sanitizeAssignablePermissions(input.permissions);
    return this.prisma.$transaction(async tx=>{
      const user=await tx.user.create({data:{username:cleanUsername,displayName:displayName.trim()||cleanUsername,passwordHash:null,passwordResetRequired:true,active:input.active!==false,networkAdmin:false,systemRole:(input.systemRole||'OPERATOR') as SystemRole,permissions:globalPermissions as Prisma.InputJsonValue}});
      if(units.length)await tx.userUnitAccess.createMany({data:units.map(x=>({userId:user.id,unitId:String(x.unitId),role:String(x.role||'operator'),permissions:sanitizeAssignablePermissions(x.permissions) as Prisma.InputJsonValue,active:true}))});
      return {id:user.id,username:user.username,displayName:user.displayName,active:user.active,networkAdmin:false,systemRole:user.systemRole,passwordResetRequired:true,permissions:globalPermissions,units:units.map(x=>({unitId:String(x.unitId),role:String(x.role||'operator'),permissions:sanitizeAssignablePermissions(x.permissions)}))};
    });
  }

  async updateAccess(userId:string,input:UserAccessInput){
    const current=await this.prisma.user.findUnique({where:{id:userId}});if(!current)throw new NotFoundException('Usuário não encontrado');
    const username=input.username?.trim();
    if(username&&username!==current.username){
      const taken=await this.prisma.user.findUnique({where:{username}});
      if(taken&&taken.id!==userId)throw new ConflictException('Usuário já existe com este login');
    }
    if(current.networkAdmin)throw new ConflictException('Conta do dono não pode ser alterada por este endpoint');
    const units=input.units||[];if(input.units)await this.validateUnits(units);
    const permissions=input.permissions===undefined?undefined:sanitizeAssignablePermissions(input.permissions);
    return this.prisma.$transaction(async tx=>{
      const user=await tx.user.update({where:{id:userId},data:{username:username||undefined,displayName:input.displayName?.trim()||undefined,active:input.active,systemRole:input.systemRole as SystemRole|undefined,permissions:permissions===undefined?undefined:permissions as Prisma.InputJsonValue,version:{increment:1}}});
      if(input.units){
        await tx.userUnitAccess.deleteMany({where:{userId}});
        if(units.length)await tx.userUnitAccess.createMany({data:units.map(x=>({userId,unitId:String(x.unitId),role:String(x.role||'operator'),permissions:sanitizeAssignablePermissions(x.permissions) as Prisma.InputJsonValue,active:true}))});
      }
      return {id:user.id,username:user.username,displayName:user.displayName,active:user.active,networkAdmin:user.networkAdmin,systemRole:user.systemRole,passwordResetRequired:user.passwordResetRequired,permissions:permissions??user.permissions};
    });
  }
}
