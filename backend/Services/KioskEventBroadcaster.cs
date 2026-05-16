using System.Collections.Concurrent;
using System.Threading.Channels;

namespace XCut.Api.Services;

public class KioskEventBroadcaster
{
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, Channel<string>>> _subs = new();

    public (Guid subId, Channel<string> channel) Subscribe(Guid salonId)
    {
        var ch    = Channel.CreateUnbounded<string>(new UnboundedChannelOptions { SingleReader = true });
        var subId = Guid.NewGuid();
        _subs.GetOrAdd(salonId, _ => new()).TryAdd(subId, ch);
        return (subId, ch);
    }

    public void Unsubscribe(Guid salonId, Guid subId)
    {
        if (_subs.TryGetValue(salonId, out var inner))
            inner.TryRemove(subId, out _);
    }

    public void Broadcast(Guid salonId, string eventType, string jsonData)
    {
        if (!_subs.TryGetValue(salonId, out var inner)) return;
        var line = $"event: {eventType}\ndata: {jsonData}\n\n";
        foreach (var (_, ch) in inner)
            ch.Writer.TryWrite(line);
    }
}
