import {z} from "zod";
export const passwordSchema=z.string().min(10).max(128);
export const staffSchema=z.object({name:z.string().trim().min(1).max(100),email:z.string().email().transform(v=>v.toLowerCase()),password:passwordSchema,role:z.enum(["staff","manager"]).default("staff")});
export const shiftSchema=z.object({date:z.coerce.date(),isDayOff:z.boolean(),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()}).superRefine((v,c)=>{if(!v.isDayOff&&(!v.startTime||!v.endTime||v.startTime>=v.endTime))c.addIssue({code:"custom",message:"勤務時間が不正です"})});
