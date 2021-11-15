#! /usr/bin/env python3

import json

class Timestamps():
  def __init__(self):
    self.input = open('timestamps.txt', 'r').read().split('\n')[:-1]
    self.range = 60000 # 30 seconds

  def inrange(self, i):
    for e in self.input:
      if i < (int(e) + self.range) and i > (int(e) - self.range):
        return True
    return False


if __name__ == '__main__':
  data = json.load(open('../src/demo/segments.json_bk', 'r'))
  stamps = Timestamps()
  for i in data:
    if stamps.inrange(int(i['start_time_utc_millis'])):
      i['events_json'] = '[{"type": "bookmark"}]'
  with open('../src/demo/segments.json', 'w') as f:
    json.dump(data, f)
