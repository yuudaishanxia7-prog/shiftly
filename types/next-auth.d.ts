import "next-auth";
declare module "next-auth" { interface User {role:"staff"|"manager";storeId:string;isActive:boolean} interface Session {user:{id:string;name?:string|null;email?:string|null;role:"staff"|"manager";storeId:string;isActive:boolean}} }
