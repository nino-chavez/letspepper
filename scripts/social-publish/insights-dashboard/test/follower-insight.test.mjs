import test from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { followerInsight } from '../src/follower-insight.js'
import { refreshWhenIdle } from '../src/refresh.js'

test('follower comparisons require complete equal-length periods, including genuine zero values',()=>{
  const before=[{follows:4,unfollows:2},{follows:4,unfollows:2}]
  assert.equal(followerInsight([{follows:0,unfollows:0}, {follows:0,unfollows:null}],before).state,'incomplete')
  assert.equal(followerInsight([{follows:0,unfollows:0}],before).state,'baseline')
  assert.equal(followerInsight(before,[{follows:4,unfollows:null},{follows:4,unfollows:2}]).state,'baseline')
  const zero=followerInsight([{follows:0,unfollows:0},{follows:0,unfollows:0}],before)
  assert.equal(zero.state,'comparison');assert.match(zero.heading,/8 fewer follows; 4 fewer unfollows/)
  assert.equal(followerInsight([],[]).state,'incomplete')
})

test('arrivals and departures remain separate even when net change is identical',()=>{
  const x=followerInsight([{follows:10,unfollows:8}],[{follows:5,unfollows:3}])
  assert.match(x.heading,/5 more follows; 5 more unfollows/)
  assert.match(x.action,/Counts alone do not justify changing/)
  assert.match(followerInsight([{follows:5,unfollows:3}],[{follows:5,unfollows:3}]).heading,/totals matched/)
})

test('idle refresh pauses for activity, forms, help and hidden tabs, then reloads the current URL',()=>{
  let now=0,loads=0,check;const events={}
  const document={visibilityState:'visible',blocked:false,activeElement:{matches:()=>false},querySelector(){return this.blocked?{}:null},addEventListener:(name,fn)=>{events[name]=fn}}
  runInNewContext(`(${refreshWhenIdle.toString()})();`,{document,Date:{now:()=>now},setInterval:fn=>{check=fn},location:{reload:()=>loads++}})
  now=299999;check();assert.equal(loads,0)
  now=300000;document.blocked=true;check();assert.equal(loads,0)
  document.blocked=false;document.activeElement.matches=()=>true;check();assert.equal(loads,0)
  document.activeElement.matches=()=>false;document.visibilityState='hidden';check();assert.equal(loads,0)
  document.visibilityState='visible';events.input();now+=59000;check();assert.equal(loads,0)
  now+=1000;check();assert.equal(loads,1)
})
