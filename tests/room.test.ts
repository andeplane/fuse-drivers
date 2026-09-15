import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEUTRAL_INPUT } from '../src/shared/input.ts';
import { applyInput, createRoom, disconnectSeat, joinRoom, leaveSeat, MAX_SEATS, parseClientMessage, seatInputs, STALE_INPUT_TICKS } from '../src/shared/room.ts';

const LEFT = { ...NEUTRAL_INPUT, left: true };
const RIGHT = { ...NEUTRAL_INPUT, right: true };

test('seats fill the lowest free slot and a full room refuses', () => {
  let room = createRoom('ABCD');
  for (let i = 0; i < MAX_SEATS; i++) {
    const [next, seat] = joinRoom(room, undefined, `token${i}aaaa`, undefined, 0);
    assert.equal(seat?.slot, i);
    room = next;
  }
  assert.equal(joinRoom(room, undefined, 'tokenxxxxx', undefined, 0)[1], null);
});

test('duplicated and reordered inputs are dropped, the latest sequence wins', () => {
  let [room] = joinRoom(createRoom('ABCD'), undefined, 'aaaaaaaa1', undefined, 0);
  room = applyInput(room, 0, 2, RIGHT, 1);
  room = applyInput(room, 0, 1, LEFT, 2); // arrived late
  room = applyInput(room, 0, 2, LEFT, 3); // duplicate sequence
  assert.deepEqual(seatInputs(room, 3)[0], RIGHT);
  room = applyInput(room, 0, 3, LEFT, 4);
  assert.deepEqual(seatInputs(room, 4)[0], LEFT);
});

test('a silent seat brakes within 15 ticks and a dropped socket brakes at once', () => {
  let [room] = joinRoom(createRoom('ABCD'), undefined, 'aaaaaaaa1', undefined, 0);
  room = applyInput(room, 0, 0, RIGHT, 10);
  assert.deepEqual(seatInputs(room, 10 + STALE_INPUT_TICKS)[0], RIGHT);
  assert.deepEqual(seatInputs(room, 11 + STALE_INPUT_TICKS)[0], { ...NEUTRAL_INPUT, brake: true });
  assert.deepEqual(seatInputs(disconnectSeat(room, 0), 11)[0], { ...NEUTRAL_INPUT, brake: true });
  assert.equal(seatInputs(room, 11)[1], undefined, 'empty seats are left to bots');
});

test('a reconnect with its token resumes the same seat', () => {
  let room = createRoom('ABCD');
  [room] = joinRoom(room, undefined, 'first0001', 'ann', 0);
  const [r2, bob] = joinRoom(room, undefined, 'second001', 'bob', 0);
  room = disconnectSeat(r2, bob!.slot);
  const [r3, again] = joinRoom(room, 'second001', 'ignored01', undefined, 50);
  assert.equal(again?.slot, 1);
  assert.equal(again?.name, 'bob');
  assert.equal(r3.seats.length, 2);
  assert.deepEqual(seatInputs(r3, 60)[1], NEUTRAL_INPUT);
});

test('a phone that reloads mid-race drives again from sequence 0', () => {
  let [room, seat] = joinRoom(createRoom('ABCD'), undefined, 'token0001', undefined, 0);
  for (let seq = 0; seq < 500; seq++) room = applyInput(room, seat!.slot, seq, LEFT, seq);
  [room] = joinRoom(disconnectSeat(room, seat!.slot), 'token0001', 'unused001', undefined, 600);
  room = applyInput(room, seat!.slot, 0, RIGHT, 601);
  assert.deepEqual(seatInputs(room, 601)[seat!.slot], RIGHT);
});

test('a seat left in the lobby is freed for the next phone', () => {
  let room = createRoom('ABCD');
  [room] = joinRoom(room, undefined, 'first0001', undefined, 0);
  [room] = joinRoom(room, undefined, 'second001', undefined, 0);
  room = leaveSeat(room, 0);
  const [next, seat] = joinRoom(room, undefined, 'third0001', undefined, 5);
  assert.equal(seat?.slot, 0);
  assert.equal(next.seats.length, 2);
});

test('socket messages are validated strictly', () => {
  assert.deepEqual(parseClientMessage('{"t":"input","seq":3,"input":{"left":true,"right":false,"brake":false,"nitro":false,"item":false,"itemAlt":false,"extra":1}}'), { t: 'input', seq: 3, input: LEFT });
  assert.equal(parseClientMessage('{"t":"input","seq":3,"input":{"left":1}}'), null);
  assert.equal(parseClientMessage('{"t":"join","code":"abcd"}'), null);
  assert.deepEqual(parseClientMessage('{"t":"join","code":"ABCD","name":"<b>x</b>"}'), { t: 'join', code: 'ABCD', name: 'bxb' });
  assert.equal(parseClientMessage('{"t":"buy","kind":"__proto__"}'), null);
  assert.equal(parseClientMessage('{"t":"start","races":100}'), null);
  assert.equal(parseClientMessage('not json'), null);
  assert.equal(parseClientMessage('x'.repeat(600)), null);
});
