import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import {compare} from "bcryptjs";
import {z} from "zod";
import {prisma} from "@/lib/prisma";

export const {handlers,auth,signIn,signOut}=NextAuth({
  trustHost:process.env.AUTH_TRUST_HOST==="true",
  session:{strategy:"jwt",maxAge:60*60*12},
  pages:{signIn:"/"},
  providers:[Credentials({credentials:{email:{},password:{}},authorize:async raw=>{
    const parsed=z.object({email:z.string().email(),password:z.string().min(8)}).safeParse(raw);
    if(!parsed.success)return null;
    const user=await prisma.user.findUnique({where:{email:parsed.data.email.toLowerCase()}});
    if(!user?.isActive||!await compare(parsed.data.password,user.passwordHash))return null;
    return {id:user.id,name:user.name,email:user.email,role:user.role,storeId:user.storeId,isActive:user.isActive};
  }})],
  callbacks:{jwt:({token,user})=>{if(user){token.id=user.id;token.role=user.role;token.storeId=user.storeId;token.isActive=user.isActive}return token},session:({session,token})=>{session.user.id=token.id as string;session.user.role=token.role as "staff"|"manager";session.user.storeId=token.storeId as string;session.user.isActive=Boolean(token.isActive);return session}},
  cookies:{sessionToken:{name:process.env.NODE_ENV==="production"?"__Secure-shiftly.session-token":"shiftly.session-token",options:{httpOnly:true,sameSite:"lax",path:"/",secure:process.env.NODE_ENV==="production"}}}
});
