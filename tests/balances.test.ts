import test from 'node:test';
import assert from 'node:assert/strict';
import { outstanding, netBalance, billTotal, isRepayment, parsePaymentAmount } from '../src/lib/balances.ts';
const split = (owed:number, paid=0, person='ee', payer='me', settled=false): any => ({ amount_owed:owed, paid_amount:paid, person_id:person, is_settled:settled, expense:{payer_id:payer} });
test('RM619.51 less RM500 paid leaves RM119.51',()=>assert.equal(outstanding(split(619.51,500)),119.51));
test('legacy fully settled rows remain zero',()=>assert.equal(outstanding(split(100,0,'ee','me',true)),0));
test('net balance subtracts opposite-direction shares and excludes other people',()=>assert.equal(netBalance([split(619.51,500),split(20,0,'me','ee'),split(200,0,'jing','me')],'me','ee'),99.51));
test('PostgREST expenses relation works as well as expense alias',()=>assert.equal(netBalance([{...split(100),expense:undefined,expenses:{payer_id:'me'}}] as any,'me','ee'),100));
test('cent arithmetic handles repeated decimal values',()=>assert.equal(netBalance([split(.1),split(.2)],'me','ee'),.3));
test('whole bills differ from shares, and repayments are not spending',()=>{const bills:any=[{description:'WMDs',total_amount:35.75},{description:'[Settlement] return',total_amount:500}]; assert.equal(billTotal(bills),35.75); assert.equal(netBalance([split(17.87)],'me','ee'),17.87);});
test('ordinary Ee-paid expense is not inferred to be repayment',()=>assert.equal(isRepayment({description:'Dinner',payer_id:'ee'} as any),false));
test('explicit linked repayment remains repayment even if description changes',()=>assert.equal(isRepayment({description:'Return',repayment_person_id:'ee'} as any),true));
test('invalid money and overprecision are rejected',()=>{for(const v of ['0','-1','1.001','NaN','Infinity','1e3',''])assert.throws(()=>parsePaymentAmount(v)); assert.equal(parsePaymentAmount('500.00'),500);});

test('reciprocal debts net to zero after the net repayment',()=>assert.equal(netBalance([split(100,80),split(20,0,'me','ee')],'me','ee'),0));
