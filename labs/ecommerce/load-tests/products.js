import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Set BASE_URL to an API instance or load balancer when comparing deployments.
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PAGE_SIZE = 50;
const TOTAL_PAGES = Number(__ENV.TOTAL_PAGES || 1); // Default seed has 3 products.

const requestsApi1 = new Counter('server_1');
const requestsApi2 = new Counter('server_2');
const requestsUnattributed = new Counter('requests_unattributed');
const durationApi1 = new Trend('server_1_ms');
const durationApi2 = new Trend('server_2_ms');

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '60s', target: 100 },
    { duration: '60s', target: 200 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Give each VU a different starting page, then advance one page per request.
  const page = ((__VU - 1) * 137 + __ITER) % TOTAL_PAGES;
  const offset = page * PAGE_SIZE;
  const response = http.get(
    `${BASE_URL}/products?limit=${PAGE_SIZE}&offset=${offset}`,
  );

  check(response, {
    'GET /products returns 200': (res) => res.status === 200,
  });

  let serverId = 'unknown';
  if (response.status === 200) {
    try {
      serverId = response.json('serverId') || 'unknown';
    } catch (_) {
      serverId = 'unknown';
    }
  }

  if (serverId === 'api-1') {
    requestsApi1.add(1);
    durationApi1.add(response.timings.duration);
  } else if (serverId === 'api-2') {
    requestsApi2.add(1);
    durationApi2.add(response.timings.duration);
  } else {
    requestsUnattributed.add(1);
  }
}
