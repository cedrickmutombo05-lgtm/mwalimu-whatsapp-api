

const processingQueues = new Map();

function runSequentialByKey(key, task) {
  const previous = processingQueues.get(key) || Promise.resolve();

  const execution = previous
    .catch(() => {})
    .then(() => task());

  const tracked = execution.finally(() => {
    if (processingQueues.get(key) === tracked) {
      processingQueues.delete(key);
    }
  });

  processingQueues.set(key, tracked);
  return tracked;
}

module.exports = {
  processingQueues,
  runSequentialByKey
};
