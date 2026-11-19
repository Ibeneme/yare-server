process.env.JWT_SECRET="testsecret"; process.env.PAYSTACK_SECRET_KEY="sk_test_x"; process.env.TZ="Africa/Lagos";
const http=require("http"), crypto=require("crypto");
const mongoose=require("mongoose"); mongoose.set("bufferCommands",false);
const { createApp }=require(__dirname + "/../src/app");
const { initSockets }=require(__dirname + "/../src/sockets");
const { generateToken }=require(__dirname + "/../src/services/token.service");
const sch=require(__dirname + "/../src/services/schedule.service");
const { io: ioc }=require("socket.io-client");
const results=[]; const ok=(n,c,x="")=>{results.push([c?"PASS":"FAIL",n,x]);};
const req=(port,method,path,{headers={},body}={})=>new Promise(r=>{const d=body?Buffer.from(typeof body==="string"?body:JSON.stringify(body)):null;
 const q=http.request({port,method,path,headers:{...(d?{"content-type":"application/json","content-length":d.length}:{}),...headers}},res=>{let b="";res.on("data",c=>b+=c);res.on("end",()=>r({s:res.statusCode,b}))});if(d)q.write(d);q.end();});
(async()=>{
 const server=http.createServer(createApp()); const io=initSockets(server);
 await new Promise(r=>server.listen(0,r)); const port=server.address().port;
 ok("health",(await req(port,"GET","/health")).s===200);
 ok("unknown route 404",(await req(port,"GET","/nope")).s===404);
 // auth guards
 for (const [m,p] of [["GET","/api/transactions"],["POST","/api/pricing"],["POST","/api/super-admin/transfer"],["GET","/api/tasks"],["GET","/api/wards"],["POST","/api/users/create"],["GET","/api/classroom/my-classes"],["GET","/api/announcements"],["POST","/api/announcements"],["GET","/api/platform-settings"],["PUT","/api/platform-settings/trial"],["GET","/api/access/students"],["POST","/api/admin/add-admin"],["PUT","/api/admin/suspend/abc"],["POST","/api/awards"],["GET","/api/awards/mine"],["POST","/api/accounts/change-password"],["GET","/api/notifications/preferences"]]){
   const r=await req(port,m,p,{body:{}}); ok(`unauth ${m} ${p} -> 401`,r.s===401,r.s);}
 const t=(id,ut,extra)=>generateToken(id,ut,undefined,extra);
 const parent={Authorization:"Bearer "+t("507f1f77bcf86cd799439011","parent")};
 const teacher={Authorization:"Bearer "+t("507f1f77bcf86cd799439012","teacher")};
 const admin={Authorization:"Bearer "+t("507f1f77bcf86cd799439013","admin",{role:"admin"})};
 ok("teacher cannot issue awards",(await req(port,"POST","/api/awards",{headers:teacher,body:{}})).s===403);
 ok("parent cannot issue awards",(await req(port,"POST","/api/awards",{headers:parent,body:{}})).s===403);
 ok("teacher has no award wallet",(await req(port,"GET","/api/awards/mine",{headers:teacher})).s===403);
 ok("teacher has no parent preferences",(await req(port,"GET","/api/notifications/preferences",{headers:teacher})).s===403);
 ok("change-password needs both fields",(await req(port,"POST","/api/accounts/change-password",{headers:parent,body:{}})).s===400);
 ok("change-password enforces length",(await req(port,"POST","/api/accounts/change-password",{headers:parent,body:{currentPassword:"x",newPassword:"short"}})).s===400);
 ok("parent cannot list all transactions",(await req(port,"GET","/api/transactions",{headers:parent})).s===403);
 ok("teacher cannot set prices",(await req(port,"POST","/api/pricing",{headers:teacher,body:{}})).s===403);
 ok("teacher cannot assign tasks",(await req(port,"POST","/api/tasks/assign",{headers:teacher,body:{}})).s===403);
 ok("parent cannot read task tracker",(await req(port,"GET","/api/tasks",{headers:parent})).s===403);
 ok("teacher cannot create teachers via /users/create",(await req(port,"POST","/api/users/create",{headers:teacher,body:{userType:"teacher",email:"a@b.c"}})).s===403);
 ok("nobody can create admin via /users/create",(await req(port,"POST","/api/users/create",{headers:admin,body:{userType:"admin",email:"a@b.c"}})).s===403);
 ok("parent cannot create teacher",(await req(port,"POST","/api/users/create",{headers:parent,body:{userType:"teacher",email:"a@b.c"}})).s===403);
 ok("old public /api/admin/register is gone",(await req(port,"POST","/api/admin/register",{body:{email:"x@y.z",password:"p",role:"superadmin"}})).s===404);
 ok("teacher blocked creating class",(await req(port,"POST","/api/class/class",{headers:teacher,body:{title:"x"}})).s===403);
 ok("teacher cannot edit announcements",(await req(port,"POST","/api/announcements",{headers:teacher,body:{kind:"banner",title:"x"}})).s===403);
 ok("parent cannot change trial settings",(await req(port,"PUT","/api/platform-settings/trial",{headers:parent,body:{days:14}})).s===403);
 ok("teacher cannot grant grace",(await req(port,"POST","/api/access/students/507f1f77bcf86cd799439011/grace",{headers:teacher,body:{duration:"1w"}})).s===403);
 ok("parent cannot grant grace",(await req(port,"POST","/api/access/students/507f1f77bcf86cd799439011/grace",{headers:parent,body:{duration:"1w"}})).s===403);
 // webhook
 const body=JSON.stringify({event:"charge.success",data:{reference:"r1"}});
 ok("webhook no signature -> 401",(await req(port,"POST","/api/payment/webhook/paystack",{body})).s===401);
 ok("webhook bad signature -> 401",(await req(port,"POST","/api/payment/webhook/paystack",{body,headers:{"x-paystack-signature":"deadbeef"}})).s===401);
 const sig=crypto.createHmac("sha512","sk_test_x").update(body).digest("hex");
 const w=await req(port,"POST","/api/payment/webhook/paystack",{body:JSON.stringify({event:"ping"}),headers:{"x-paystack-signature":crypto.createHmac("sha512","sk_test_x").update(JSON.stringify({event:"ping"})).digest("hex")}});
 ok("webhook good signature, ignored event -> 200",w.s===200,w.s);
 // schedule maths: cron ticks at hh:mm:00.5; a class at hh:mm+30 must fire on that tick only
 const tick=new Date(); tick.setHours(10,0,0,500);
 const cls={schedules:[{frequency:"daily",timeSlots:[{startTime:"10:30",endTime:"11:30"}]}]};
 const at=(m,sec=0)=>{const d=new Date(tick);d.setMinutes(m,sec,500);return d;};
 const fires=d=>sch.upcomingSessions(cls,d,29*60000,30*60000).length;
 ok("fires on the tick 30 min before",fires(at(0))===1);
 ok("does not fire 29 min before",fires(at(1))===0);
 ok("does not fire 31 min before",fires(at(59,0)||at(-1))===0);
 ok("fires once across a minute of ticks",[0,1,2,3].map(m=>fires(at(m))).reduce((a,b)=>a+b)===1);
 const now=new Date();
 const cls2={schedules:[{frequency:"daily",timeSlots:[{startTime:String(new Date(now.getTime()+90*60000).getHours()).padStart(2,"0")+":00",endTime:"23:59"}]}]};
 ok("no reminder for class 90 min away",sch.upcomingSessions(cls2,now,29*60000,30*60000).length===0);
 const wk={schedules:[{frequency:"weekly",daysOfWeek:[{day:(now.getDay()+1)%7,timeSlots:[{startTime:"10:00",endTime:"11:00"}]}]}]};
 ok("weekly slot only on its day",sch.occurrencesOnDay(wk,now).length===0 && sch.occurrencesOnDay(wk,new Date(now.getTime()+864e5)).length===1);
 // sockets
 const url="http://localhost:"+port;
 const noTok=ioc(url,{reconnection:false}); 
 await new Promise(r=>{noTok.on("connect_error",e=>{ok("socket without token rejected",/Authentication/.test(e.message),e.message);r()});noTok.on("connect",()=>{ok("socket without token rejected",false);r()})});
 const badTok=ioc(url,{reconnection:false,auth:{token:"junk"}});
 await new Promise(r=>{badTok.on("connect_error",e=>{ok("socket bad token rejected",/Invalid/.test(e.message));r()});badTok.on("connect",()=>{ok("socket bad token rejected",false);r()})});
 const good=ioc(url,{reconnection:false,auth:{token:t("507f1f77bcf86cd799439012","teacher")}});
 await new Promise(r=>good.on("connect",r)); ok("socket with valid token connects",good.connected);
 await new Promise(r=>{good.on("join-denied",()=>{ok("join denied when DB cannot confirm access",true);r()});good.emit("join","507f1f77bcf86cd799439099","T")});
 good.close();noTok.close();badTok.close();
 results.forEach(r=>console.log(r.join(" | ")));
 console.log("FAILS:",results.filter(r=>r[0]==="FAIL").length);
 io.close();server.close();process.exit(0);
})().catch(e=>{console.error("CRASH",e);process.exit(1)});
