const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");
const FOUNDERS = new Map([["701782316623855668","Very"],["482499344982081546","Dmytro"]]);
function getSupabase(){if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return null;return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
function parseCookies(req){return Object.fromEntries((req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]}))}
function readSession(req){const t=parseCookies(req).rynow_session;if(!t||!process.env.SESSION_SECRET)return null;try{return jwt.verify(t,process.env.SESSION_SECRET,{issuer:"rynow-ai",audience:"rynow-site"})}catch{return null}}
function isFounder(id){return FOUNDERS.has(String(id))}
function json(res,status,body){res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store");res.end(JSON.stringify(body))}
async function readBody(req){if(req.body&&typeof req.body==="object")return req.body;return new Promise((resolve,reject)=>{let raw="";req.on("data",c=>raw+=c);req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}});req.on("error",reject)})}
module.exports={FOUNDERS,getSupabase,readSession,isFounder,json,readBody,parseCookies};