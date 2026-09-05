import assert from "node:assert/strict";
import test from "node:test";
import { SkillOfferQueue } from "../../apps/client/src/skillOfferQueue.js";

type Offer = { offerId: string; value: number };

test("online skill offers remain FIFO while a modal is active", () => {
  const queue = new SkillOfferQueue<Offer>();
  assert.deepEqual(queue.receive({ offerId: "b", value: 2 }, "a"), { kind: "queued" });
  assert.deepEqual(queue.receive({ offerId: "c", value: 3 }, "a"), { kind: "queued" });
  assert.equal(queue.pendingCount, 2);
  assert.equal(queue.next()?.offerId, "b");
  assert.equal(queue.next()?.offerId, "c");
});

test("active, queued, and submitted offer resends are ignored", () => {
  const queue = new SkillOfferQueue<Offer>();
  assert.equal(queue.receive({ offerId: "a", value: 1 }, "a").kind, "ignored");
  assert.equal(queue.receive({ offerId: "b", value: 2 }, "a").kind, "queued");
  assert.equal(queue.receive({ offerId: "b", value: 9 }, "a").kind, "ignored");
  assert.equal(queue.markSubmitted("a"), true);
  assert.equal(queue.markSubmitted("a"), false);
  assert.equal(queue.receive({ offerId: "a", value: 8 }, null).kind, "ignored");
});

test("an idle coordinator returns an offer immediately and reset starts a new session", () => {
  const queue = new SkillOfferQueue<Offer>();
  assert.deepEqual(queue.receive({ offerId: "a", value: 1 }, null), {
    kind: "ready",
    offer: { offerId: "a", value: 1 },
  });
  queue.markSubmitted("a");
  queue.receive({ offerId: "b", value: 2 }, "other");
  queue.clear();
  assert.equal(queue.pendingCount, 0);
  assert.equal(queue.receive({ offerId: "a", value: 3 }, null).kind, "ready");
});
