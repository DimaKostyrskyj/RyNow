const{getSupabase,readSession,isFounder,json,readBody,FOUNDERS}=require("./_shared");
module.exports=async(req,res)=>{const user=readSession(req);if(!user)return json(res,401,{error:"Требуется вход."});if(!isFounder(user.id))return json(res,403,{error:"Доступ только основателям."});const s=getSupabase();if(!s)return json(res,503,{error:"Supabase не настроен."});
await s.from("profiles").upsert({
  discord_id:String(user.id),
  username:user.username||"Discord User",
  email:user.email||null,
  avatar_url:user.avatar||null,
  banner_url:user.banner||null,
  is_founder:true,
  role:"Основатель",
  last_login_at:new Date().toISOString()
},{onConflict:"discord_id"});const u=new URL(req.url,"https://rynow.vercel.app"),r=u.searchParams.get("resource")||"overview",id=u.searchParams.get("id"),tables={users:"profiles",news:"news",rules:"rules",knowledge:"knowledge_base"};
if(r==="overview"&&req.method==="GET"){const a=await Promise.all(["profiles","news","rules","knowledge_base"].map(t=>s.from(t).select("*",{count:"exact",head:true})));return json(res,200,{user,counts:{users:a[0].count||0,news:a[1].count||0,rules:a[2].count||0,knowledge:a[3].count||0},founders:[...FOUNDERS.entries()].map(([id,name])=>({id,name}))})}
const table=tables[r];if(!table)return json(res,400,{error:"Unknown resource"});
if(req.method==="GET"){const{data,error}=await s.from(table).select("*").order(r==="users"?"registered_at":"created_at",{ascending:false});return error?json(res,500,{error:error.message}):json(res,200,{items:data})}
if(req.method==="POST"){if(r==="users")return json(res,405,{error:"Пользователи создаются через Discord."});const b=await readBody(req),p={title:String(b.title||"").trim(),content:String(b.content||"").trim(),published:b.published!==false,created_by:String(user.id)};if(r==="rules")p.category=String(b.category||"Общие правила");if(r==="knowledge")p.tags=Array.isArray(b.tags)?b.tags:[];if(!p.title||!p.content)return json(res,400,{error:"Заполните поля."});const{data,error}=await s.from(table).insert(p).select().single();return error?json(res,500,{error:error.message}):json(res,201,{item:data})}
if(req.method==="PUT"){if(!id)return json(res,400,{error:"Нет ID."});const b=await readBody(req),p=r==="users"?{role:String(b.role||"Пользователь"),is_banned:!!b.isBanned,updated_at:new Date().toISOString()}:{title:String(b.title||"").trim(),content:String(b.content||"").trim(),published:b.published!==false,updated_at:new Date().toISOString()};if(r==="rules")p.category=String(b.category||"Общие правила");if(r==="knowledge")p.tags=Array.isArray(b.tags)?b.tags:[];const{data,error}=await s.from(table).update(p).eq("id",id).select().single();return error?json(res,500,{error:error.message}):json(res,200,{item:data})}
if(req.method==="DELETE"){if(!id)return json(res,400,{error:"Нет ID."});if(r==="users")return json(res,405,{error:"Удаление пользователей отключено."});const{error}=await s.from(table).delete().eq("id",id);return error?json(res,500,{error:error.message}):json(res,200,{ok:true})}json(res,405,{error:"Method not allowed"})};