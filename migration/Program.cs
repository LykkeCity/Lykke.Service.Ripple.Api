using System;
using MongoDB.Bson;
using MongoDB.Driver;
using System.Runtime.InteropServices.ComTypes;

namespace migration
{
    class Program
    {
        static async void Main(string[] args)
        {
            if (args.Length != 5)
            {
                throw new ArgumentException("Usage: ./migration.exe \"source_mongo_connection_string\" \"source_mongo_db\" \"target_mongo_connection_string\" \"target_mongo_db\" \"target_azure_connection_string\"");
            }

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
                                                       .Project(Select.Expression(doc => doc["_id"].AsString))
                                                       .ToListAsync();

            foreach (var address in observedAddresses)
            {
                await targetAddressCollection.ReplaceOneAsync(
                    Filter.Eq("Address", address),
                    new BsonDocument() { { "_id", address } },
                    new UpdateOptions() { IsUpsert = true });

                await targetBalanceCollection.UpdateManyAsync(
                    Filter.Eq("Address", address),
                    Builders<BsonDocument>.Update.Set("IsObservable", true));
            }

            var lastTransactionPages = await sourceMongoDb.GetCollection<BsonDocument>("transactions")
                                                          .Find(Filter.And(Filter.Exists("page"), Filter.Ne<long?>("page", null)))
                                                          .Sort(Builders<BsonDocument>.Sort.Descending("timestamp"))
                                                          .Project(Select.Expression(doc => doc["page"].AsNullableInt64))
                                                          .FirstOrDefaultAsync();

            if (lastTransactionPages.HasValue)
            {

            }


            // const lastTransactionPages = await db.collection("transactions")
            //     .find({ page: { $exists: true, $ne: null } })
            // .sort({ timestamp: -1 })
            // .limit(1)
            // .map(_ => _.page)
            // .toArray();

            // const lastProcessedLedger = !!lastTransactionPages[0] && lastTransactionPages[0] / 10;
            // if (!!lastProcessedLedger)
            // {
            //     await this.paramsRepository.upsert(lastProcessedLedger);
            // }

            // const xrp = await this.assetRepository.get("XRP");
            // if (!xrp)
            // {
            //     await this.assetRepository.upsert("XRP", "", "Ripple native asset", 6);
            // }
        }
    }
}
