import {auth} from "@/auth";
import {prisma} from "@/lib/prisma";
import {Prisma} from "@prisma/client";
import {ZodError} from "zod";

export class AccessError extends Error {status:number;constructor(message="Forbidden",status=403){super(message);this.status=status}}
export async function requireUser(){const session=await auth();if(!session?.user?.id)throw new AccessError("Unauthorized",401);const user=await prisma.user.findUnique({where:{id:session.user.id},select:{id:true,name:true,email:true,role:true,storeId:true,isActive:true}});if(!user?.isActive)throw new AccessError("Unauthorized",401);return user}
export async function requireManager(){const user=await requireUser();if(user.role!=="manager")throw new AccessError();return user}
export async function periodInStore(periodId:string,storeId:string){const period=await prisma.shiftPeriod.findFirst({where:{id:periodId,storeId}});if(!period)throw new AccessError("Not found",404);return period}
export function apiError(error:unknown){if(error instanceof AccessError)return Response.json({error:error.message},{status:error.status});if(error instanceof ZodError)return Response.json({error:error.issues[0]?.message||"入力内容を確認してください"},{status:400});if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")return Response.json({error:"同じ内容のデータがすでに登録されています"},{status:409});console.error(error);return Response.json({error:"Internal server error"},{status:500})}
