using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.WindowsAzure.Storage;
using Microsoft.WindowsAzure.Storage.Table;
using MongoDB.Bson;
using MongoDB.Driver;

namespace migration
{
    class Program
    {
        static async Task Main(string[] args)
        {
            if (args.Length != 5)
            {
                Console.WriteLine("Usage: ./migration.exe \"source_mongo_connection_string\" \"source_mongo_db\" \"target_mongo_connection_string\" \"target_mongo_db\" \"target_azure_connection_string\"");
                Console.WriteLine("Press any key to exit");
                Console.Read();
                return;
            }

            // migrate observed addresses

            Console.WriteLine("Observed addresses:");

            var Filter = Builders<BsonDocument>.Filter;
            var Select = Builders<BsonDocument>.Projection;

            var sourceMongoClient = new MongoClient(args[0]);
            var sourceMongoDb = sourceMongoClient.GetDatabase(args[1]);
            var targetMongoClient = new MongoClient(args[2]);
            var targetMongoDb = targetMongoClient.GetDatabase(args[3]);
            var targetAddressCollection = targetMongoDb.GetCollection<BsonDocument>("RippleBalanceAddresses");
            var targetBalanceCollection = targetMongoDb.GetCollection<BsonDocument>("RippleBalances");
            var observedAddresses = await sourceMongoDb.GetCollection<BsonDocument>("accounts")
                                                       .Find(new BsonDocument())
                                                       .Project(Select.Expression(doc => doc["_id"]))
                                                       .ToListAsync();

            foreach (var address in observedAddresses)
            {
                await targetAddressCollection.ReplaceOneAsync(Filter.Eq("_id", address), new BsonDocument() { { "_id", address } }, new UpdateOptions() { IsUpsert = true });
                await targetBalanceCollection.UpdateManyAsync(Filter.Eq("Address", address), Builders<BsonDocument>.Update.Set("IsObservable", true));

                Console.WriteLine(address);
            }

            // setup last processed ledger, if any

            var azureStorageAccount = CloudStorageAccount.Parse(args[4]);
            var azureClient = azureStorageAccount.CreateCloudTableClient();
            var tableParams = azureClient.GetTableReference("RippleParams");

            await tableParams.CreateIfNotExistsAsync();

            var lastTransactionPage = await sourceMongoDb.GetCollection<BsonDocument>("transactions")
                                                         .Find(Filter.And(Filter.Exists("page"), Filter.Ne<long?>("page", null)))
                                                         .Sort(Builders<BsonDocument>.Sort.Descending("timestamp"))
                                                         .Project(Select.Expression(doc => doc["page"]))
                                                         .FirstOrDefaultAsync();

            if (lastTransactionPage != null)
            {
                var lastProcessedLedger = lastTransactionPage.ToInt64() / 10;
                await tableParams.ExecuteAsync(TableOperation.InsertOrMerge(new DynamicTableEntity("Params", "", "*", new Dictionary<string, EntityProperty>
                {
                    { "LastProcessedLedger", new EntityProperty(lastProcessedLedger) }
                })));

                Console.WriteLine($"Setup params, last processed ledger: {lastProcessedLedger}");
            }

            // setup XRP asset, if necessary

            var tableAssets = azureClient.GetTableReference("RippleAssets");

            await tableAssets.CreateIfNotExistsAsync();

            var xrp = await tableAssets.ExecuteAsync(TableOperation.Retrieve("XRP", ""));

            if (xrp.Result == null)
            {
                await tableAssets.ExecuteAsync(TableOperation.Insert(new DynamicTableEntity("XRP", "", "*", new Dictionary<string, EntityProperty>
                {
                    { "Name", new EntityProperty("Ripple native asset") },
                    { "Accuracy", new EntityProperty(6) }
                })));

                Console.WriteLine($"Added XRP asset");
            }

            Console.WriteLine("Done");
            Console.WriteLine("Press any key to exit");
            Console.Read();
        }
    }
}
