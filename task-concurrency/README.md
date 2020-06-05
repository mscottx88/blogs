# Distributed Locking in DynamoDB

DynamoDB is the AWS defacto NoSQL solution. DynamoDB provides great flexibility for storing a wide range of data with impressive scaling and high throughput. DynamoDB also provides ACID (atomicity, consistency, isolation, and durability) guarantees through transactions. Despite the benefits of DynamoDB, the solution does not provide units of work. Isolation is only provided through interference detection.

A transaction in DynamoDB is an all-or-nothing operation without any residual locking, committing or rollback operations. Transactions fail in DynamoDB if two processes interfere with any shared data. Either one or both of the failed transactions are rolled-back entirely. As a consequence, a common strategy for transaction fault-tolerance when working with DynamoDB is retry with exponential back-off. This rudimentary approach may work for common use cases. However, applications which might otherwise take advantage of isolation levels and units of work become complicated with loops and additional state-management.

# Isolation Levels

Traditional relational databases simplify application design with concurrency guarantees provided by various levels of row, and even table locking. When a process tries to access a row which is locked by another process, it must wait for that lock to be released.

Consider the common isolation levels provided by many relational databases:

**Serializable**
No two processes can interfere with each other in anyway; they are said to be serialized.

**Repeatable Read**
Rows read must already be committed; whether updated or not are locked.

**Read Committed**
Rows read must already be committed; the currently read row is locked; updated rows are locked.

**Read Uncommitted**
Rows read need not already be committed; the currently read row is locked; updated rows are locked.

None of these isolation levels are provided by DynamoDB.

# Unit of Work

In addition to isolation levels, traditional relational databases provide a feature known as a unit of work, or UOW.

A unit of work typically involves:

1. Beginning a transaction (either implicitly or explicitly) with a defined (or inferred) isolation level;
2. Performing some activity in the database, such as reading, updating, or deleting rows and tables;
3. Ending the transaction (either application-controlled or database manager-controlled) with a decision to commit or rollback any changes.

Throughout the course of the unit of work, rows which are affected by the application are appropriately isolated from other processes through row-level (and in some cases table-level) locks.

DynamoDB does not provide units of work beyond the simplest concept that the entirety of the transaction is either successful or not. Furthermore, transactions in DynamoDB are severely limited by the number of rows which can be affected. Any sufficiently complex application will easily exceed the current limit of 25 rows per transaction.

To overcome these limitations of an otherwise powerful NoSQL solution, application-level concurrency can be a possibility.

# Implementing Concurrency Locks in DynamoDB

Consider the scenario where two or more processes may interfere with each other. One process might try to insert, update, or delete one or more rows. If there is no other active process, then there is no problem because there is zero concurrency. Without concerns of concurrency, isolation levels and units of work have no real value. In reality, a robust application must assume there are potentially many concurrent processes vying for the same data.

Since DynamoDB does not provides neither isolation levels nor units of work, and transactions are severely limited in their size and capability, applications need another way to isolate themselves from each other.

An ideal solution will have the following characteristics:

- FIFO (first-in, first-out) - access to shared data will be handled in the order requested
- Record wait - a process can choose to wait for a defined amount of time before failing
- Isolated - no two processes can share the data concurrently
- Fault-tolerant - no user or application intervention will be required to handle failures
- Self-cleaning - any locks acquired must be removed automatically

# Process Queueing

Imagine a set of processes as a FIFO (first-in, first-out) queue. The first such process will have no competing process; naturally it is the first and therefore is able to perform its work. Subsequent processes must wait their respective turns before accessing the shared data. If each process were to "take a number" so to speak, then after the first process completes its work, the process next in line will be allowed to proceed.

DynamoDB has a feature which can be used to create such a mechanism: atomic counters. An atomic counter in DynamoDB allows an application to update a row through incrementing the value. While the order of simultaneous processes accessing the counter is not guaranteed, the result is that no two processes will obtain the exact same result. Additionally, the value is atomically incremented and globally unique.

**Note** DynamoDB supports integer values with up to 38 digits of precision. This means a ticket number can range between `1` and `99,999,999,999,999,999,999,999,999,999,999,999,999`. That's 99 _undecillion_ ticket numbers. Using this scheme, processes requesting one thousand ticket numbers per second every day, every year, would take `31,709,791,983,764,586,504,312,531,709` _years_ before the limit were reached.

The row holding the ticket number will need a common partition key value known to all processes. If the ticket number is shared across multiple disparate locks, then a simple name will suffice. If namespacing is desirable, then a more complex partition key with prefixes or a partition key combined with a sort key namespace is a possibility.

Once the ticket number is determined, the process enters the queue by creating a row in DynamoDB where the sort key defines the order of the data using the ticket number. The partition key of the queue row will need to be the entity being locked. If multiple types of locks are desired against the same entity, then the sort key can implement a namespace prefix followed by the ticket number. If the sort key is not numeric, then for proper hexadecimal sorting to work, the ticket number must be left-padded with zeros.

# Record wait

Processes should not check the queue indefinitely - unless it chooses to do so. During queue checking, the process can check the elapsed time against a start time. Once the configured wait time for a lock has been reached, the process can choose to throw an exception or otherwise return unsuccessfully.

If the record wait parameter is zero, then the process should fail if there is any other process already in the queue.

If the record wait parameter is `Infinity`, then process should never stop waiting to reach the front of the queue.

A common setting for this parameter can be sixty seconds.

# Process Isolation

To isolate any two processes, each will need to check their relative position in the queue. Once a given process is the first in the queue then it is allowed to proceed. This can be accomplished by querying the queue rows. It is important that strongly consistent reads are enforced when checking the queue. This ensures that all pending updates to the partition key are applied before reading the queue.

After completing its work, the process which was first in the queue needs to delete its queue entry.

The query operation will specify the partition key, which is the entity locked. If lock namespaces are implemented, the sort key can use the `begins_with` operator, where the prefix is the namespace.

For the rows which are queried, the application determines if the sort key matches the sort key containing the ticket number for the relevant process. If it does not and it is less than the ticket number for the given process, then that process is still waiting in the queue. If the sort key does match and there are no processes before the given process, then that process is first in the queue and is allowed to proceed.

# Fault-tolerance

When creating the queue row, an expiration timestamp is also included. Rows created in the queue cannot exist forever. In fact, rows should have a reasonably short time to live such as sixty seconds. When a given process creates its entry in the queue, it will need to periodically refresh the expiration time. If sixty seconds is chosen as the time for the lock to live, then a half-life value of thirty seconds is a reasonable interval of time for the process to refresh the lock.

This "heartbeat" approach to refreshing the lock expiration value, combined with a relatively short time to live provides fault-tolerance. If a given process fails to refresh the expiration time before it expires, then it will shortly thereafter be considered stale. During the queue check, processes can ignore those rows which are considered expired. Those rows would have an expiration value which is less than the current time.

**Note** Two servers with different clock reads can suffer from clock drift. A sixty second range of variance is sufficient to account for such anomalies.

# Self-cleaning

Rows which are found to be expired can either be ignored, proactively removed, or lazily removed by DynamoDB. If the rows are ignored, then stranded locks will grow over time, unnecessarily increasing the size of the table. Additionally, the time to process the queue to determine the relative position of a given process will increase over time.

Processes can proactively clean any expired rows by deleting them from the queue. Alternatively, the TTL (time to live) feature of DynamoDB can be used here. With the TTL feature, DynamoDB will periodically scan and delete expired items automatically.

If the TTL feature is used, then the expiration time needs to be numeric value representing the time of expiration using the Unix epoch time format, in seconds. That is, the number of seconds elapsed since `1970-01-01T00:00:00.000Z`, plus the amount of time to live, in seconds.
