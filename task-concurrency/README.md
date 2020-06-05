# Distributed Locking in DynamoDB

DynamoDB is the AWS defacto NoSQL solution. DynamoDB provides great flexibility for storing a wide range of data with impressive scaling and high throughput. DynamoDB also provides ACID (atomicity, consistency, isolation, and durability) guarantees through transactions.

Although DynamoDB has many benefits of DynamoDB, there are some limitations. While transactions provide some guarantees surrounding atomicity and consistency, the solution does not provide units of work. Additionally, isolation is only provided through interference detection.

A transaction in DynamoDB is an all-or-nothing operation without any residual locking, committing or rollback operations. Transactions fail in DynamoDB if two processes interfere with any shared data. Either one or both of the failed transactions are rolled-back entirely.

As a consequence, a common strategy for transaction fault-tolerance when working with DynamoDB is retry with exponential back-off. While this rudimentary approach may work for common use cases, applications which might otherwise take advantage of isolation levels and units of work become complicated with loops and additional state-management.

Finally, transactions in DynamoDB have severe limitations. The number of rows in a DynamoDB transaction is limited to 25. Additionally, no row can be referenced by more than one check or mutation in a single transaction. This means you cannot apply a condition and also update a row, for example.

# Implementing Concurrency Locks in DynamoDB

Consider the scenario where two or more processes may interfere with each other. One process might try to insert, update, or delete one or more rows. If there is no other active process, then there is no problem because there is zero concurrency. Without concerns of concurrency, isolation levels and units of work have no real value. In reality, a robust application must assume there are potentially many concurrent processes vying for the same data.

Without full commitment control features like units of work, commit, rollback, and row-level locking, any sufficiently complex transaction can easily exceed the limitations of DynamoDB transactions.

Since DynamoDB provides neither isolation levels nor units of work, and transactions are severely limited in their size and capability, applications need another way to isolate themselves from each other. If applications can logically isolate each other from accessing shared data, they can be assured they will not interfere with each other.

An ideal solution will have the following characteristics:

- FIFO (first-in, first-out) - access to shared data will be handled in the order requested
- Record wait - a process can choose to wait for a defined amount of time before failing
- Isolated - no two processes can share the data concurrently
- Fault-tolerant - no user or application intervention will be required to handle failures
- Self-cleaning - any locks acquired must be removed automatically

# Queueing

Imagine a set of processes as a FIFO (first-in, first-out) queue. The first such process will have no competing process; naturally it is the first and therefore is able to perform its work. Subsequent processes must wait their respective turns before accessing the shared data. If each process were to "take a number" so to speak, then after the first process completes its work, the process next in line will be allowed to proceed.

DynamoDB has a feature which can be used to create such a mechanism: atomic counters. An atomic counter in DynamoDB allows an application to update a row through incrementing the value. While the order of simultaneous processes accessing the counter is not guaranteed, the result is that no two processes will obtain the exact same result. Additionally, the value is atomically incremented and globally unique.

**Note** DynamoDB supports integer values with up to 38 digits of precision. This means a ticket number can range between `1` and `99,999,999,999,999,999,999,999,999,999,999,999,999`. That is 99 _undecillion_ ticket numbers. Using this scheme, processes requesting one million ticket numbers per second every day, every year, would take `31,536,000,000,000` _years_ before the limit is reached.

The row holding the ticket number will need a common partition key value known to all processes. If the ticket number is shared across multiple disparate locks, then a simple name will suffice. If namespacing is desirable, then a more complex partition key with prefixes or a partition key combined with a sort key namespace is a possibility.

Once the ticket number is determined, the process enters the queue by creating a row in DynamoDB where the sort key defines the order of the data using the ticket number. The partition key of the queue row is the name of the entity being locked. If multiple types of locks are desired against the same entity, then the sort key can implement a namespace prefix followed by the ticket number.

**Note** If the sort key is not numeric, then for proper hexadecimal sorting to work, the ticket number must be left-padded with zeros.

# Record wait

Processes should not check the queue indefinitely - unless it chooses to do so. During queue checking, the process can check the elapsed time against a start time. Once the configured wait time for a lock has been reached, the process can choose to throw an exception or otherwise return unsuccessfully.

If the record wait parameter is `0`, then the process should fail if there is any other process already in the queue. This is known as no wait.

If the record wait parameter is `Infinity`, then the process should never stop waiting to reach the front of the queue.

A commonly used setting for this parameter is sixty seconds.

# Isolation

To isolate any two processes, each process will need to check their relative position in the queue. Once a given process is the first in the queue then it is allowed to proceed. This is accomplished by querying the queue rows.

The query operation will specify the partition key, which is the name of the entity locked. If lock namespaces are implemented, the sort key can use the `begins_with` operator, where the prefix is the namespace. Otherwise, the sort key is the ticket number and the sort key component of the key expression can request those rows whose ticket number is less than the ticket number obtained by the given process.

**Note** It is important that strongly consistent reads are enforced when checking the queue. This ensures that all pending updates to the partition key are applied before reading the queue.

For the rows which are queried, the application determines if the sort key matches the sort key containing the ticket number for the relevant process. If it does not and it is less than the ticket number for the given process, then that process is still waiting in the queue. If the sort key does match and there are no processes before the given process, then that process is first in the queue and is allowed to proceed.

After completing its work, the process which was first in the queue needs to delete its queue entry.

# Fault-tolerance

When creating the queue row, an expiration timestamp is also included. Rows created in the queue cannot exist forever. In fact, rows should have a reasonably short time to live such as sixty seconds. When a given process creates its entry in the queue, it will need to periodically refresh the expiration time. If sixty seconds is chosen as the time for the lock to live, then a half-life value of thirty seconds is a reasonable interval of time for the process to refresh the lock.

In other words, the original lock entry in the queue defines an expiration of sixty seconds from the time of creation. Every thirty seconds later, the process should update the expiration time to be another sixty seconds from then.

This "heartbeat" approach to refreshing the lock expiration value, combined with a relatively short time to live provides fault-tolerance. If a given process fails to refresh the expiration time before it expires, then it will shortly thereafter be considered stale. During the queue check, processes can ignore those rows which are considered expired. Such rows would have an expiration value which is less than the current time.

**Note** Two servers may experience clock drift. A sixty second time to live and a thirty second refresh interval provides a generous thirty second range of variance to account for such anomalies.

# Self-cleaning

Rows which are found to be expired can either be ignored, proactively removed, or lazily removed by DynamoDB. If the rows are ignored, then stranded locks will grow over time, unnecessarily increasing the size of the table. Additionally, the time to process the queue to determine the relative position of a given process will increase over time.

Processes can proactively clean any expired rows by deleting them from the queue. Alternatively, the TTL (time to live) feature of DynamoDB can be used here. With the TTL feature, DynamoDB will periodically scan and delete expired items automatically.

If the TTL feature is used, then the expiration time needs to be numeric value representing the time of expiration using the Unix epoch time format, in seconds. That is, the number of seconds elapsed since `1970-01-01T00:00:00.000Z`, plus the amount of time to live, in seconds.
