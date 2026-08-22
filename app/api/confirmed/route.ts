import {randomUUID} from "crypto";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {apiError,periodInStore,requireManager} from "@/lib/access";

const timePattern=/^([01]\d|2[0-3]):[0-5]\d$/;
const createSchema=z.object({
  userId:z.string().uuid(),
  shiftPeriodId:z.string().uuid(),
  date:z.coerce.date(),
  startTime:z.string().regex(timePattern),
  endTime:z.string().regex(timePattern),
}).superRefine((value,context)=>{
  if(value.startTime>=value.endTime)context.addIssue({code:"custom",message:"勤務時間が不正です"});
});
const atTime=(value:string)=>new Date(`1970-01-01T${value}:00.000Z`);
const minutes=(value:string)=>{const [hours,mins]=value.split(":").map(Number);return hours*60+mins};
const hhmm=(value:Date)=>value.toISOString().slice(11,16);

export async function POST(request:Request){
  try{
    const manager=await requireManager();
    const body=createSchema.parse(await request.json());
    const [period,user,settings]=await Promise.all([
      periodInStore(body.shiftPeriodId,manager.storeId),
      prisma.user.findFirst({where:{id:body.userId,storeId:manager.storeId,isActive:true},select:{id:true}}),
      prisma.storeSettings.findUniqueOrThrow({where:{storeId:manager.storeId}}),
    ]);
    if(!user)return Response.json({error:"Not found"},{status:404});
    if(body.date.getUTCFullYear()!==period.year||body.date.getUTCMonth()+1!==period.month)return Response.json({error:"対象期間外の日付です"},{status:400});
    const businessStart=hhmm(settings.businessStartTime),businessEnd=hhmm(settings.businessEndTime);
    const start=minutes(body.startTime),end=minutes(body.endTime),base=minutes(businessStart);
    if(start<base||end>minutes(businessEnd)||(start-base)%settings.shiftIntervalMinutes!==0||(end-base)%settings.shiftIntervalMinutes!==0)return Response.json({error:"営業時間と入力間隔に合う勤務時間を指定してください"},{status:400});
    return Response.json(await prisma.confirmedShift.create({data:{id:randomUUID(),userId:user.id,shiftPeriodId:period.id,date:body.date,startTime:atTime(body.startTime),endTime:atTime(body.endTime),isDayOff:false},include:{user:{select:{id:true,name:true}}}}),{status:201});
  }catch(error){
    return apiError(error);
  }
}
