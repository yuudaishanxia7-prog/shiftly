import {prisma} from "@/lib/prisma";
import {apiError,periodInStore,requireManager} from "@/lib/access";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const user=await requireManager();
    const {id}=await params;
    const period=await periodInStore(id,user.storeId);
    if(period.status!=="published")return Response.json({error:"公開済みではありません"},{status:409});
    await prisma.shiftPeriod.update({where:{id},data:{status:"reviewing",publishedAt:null}});
    return Response.json({ok:true});
  }catch(error){
    return apiError(error);
  }
}
