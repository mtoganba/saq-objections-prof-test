import test from "node:test";
import assert from "node:assert/strict";
import {initialState} from "../../../api/objectionsRepository";
import {applyAction, nextAction} from "../services/workflow";
import type {Action} from "../../../types";
test("суперпользователь сам формирует, согласует, подписывает запрос и ответ",()=>{
 let state=initialState();const id=state.cases[0].id;
 const run=(action:Action,values:Record<string,string>={})=>{
   const form=new FormData();Object.entries(values).forEach(([key,value])=>form.set(key,value));
   state=applyAction(state,id,action,"demo-superuser",form);
 };
 run("request",{recipient:"ДВГА по Атырауской области",deadline:"2026-09-10T18:00"});
 run("send-request-approval");run("approve-request",{approved:"on"});run("sign-request");
 assert.equal(nextAction(state.cases[0],"demo-superuser")?.action,"fill-request-response");
 const values:Record<string,string>={};
 for(const point of state.cases[0].issues.filter(item=>item.disputed)) {
   values[`authorityFinding_${point.id}`]="Нарушение по материалам проверки";
   values[`authorityResponse_${point.id}`]="Мотивированный ответ и материалы";
 }
 run("fill-request-response",values);run("approve-response");run("sign-response");
 assert.ok(state.cases[0].history.slice(-7).every(event=>event.actor==="Демо-суперпользователь"));
});
