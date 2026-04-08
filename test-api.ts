
async function test() {
  const url = 'http://localhost:4001/api/test-runner/start';
  const payload = {
    url: 'https://github.com', // 測試用 URL
    projectId: 1
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 如果需要認證，可能需要 token
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
