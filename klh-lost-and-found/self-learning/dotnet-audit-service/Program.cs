using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Concurrent;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

var deskCheckouts = new ConcurrentBag<object>();

app.MapGet("/audit/health", () => Results.Ok(new { status = "ok", campus = "KLH University" }));

app.MapPost("/audit/handover", (HandoverRecord record) =>
{
    var stamped = new
    {
        record.PickupCode,
        record.StudentRollNumber,
        record.DeskName,
        CompletedAt = DateTime.UtcNow
    };
    deskCheckouts.Add(stamped);
    return Results.Created("/audit/handover", stamped);
});

app.MapGet("/audit/handover", () => Results.Ok(deskCheckouts));

app.Run("http://0.0.0.0:8005");

public record HandoverRecord(string PickupCode, string StudentRollNumber, string DeskName);
