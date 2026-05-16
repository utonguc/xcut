// Services/TokenService.cs
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using XCut.Api.Models;
using Microsoft.IdentityModel.Tokens;

namespace XCut.Api.Services;

public interface ITokenService
{
    string   CreateToken(User user, Guid? viewingSalonId = null);
    string   CreateKioskToken(Guid salonId, Guid kioskCodeId, string? label);
    DateTime GetExpiryUtc();
}

public class TokenService : ITokenService
{
    private readonly IConfiguration _configuration;

    public TokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string CreateToken(User user, Guid? viewingSalonId = null)
    {
        var key      = _configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT key missing.");
        var issuer   = _configuration["Jwt:Issuer"];
        var audience = _configuration["Jwt:Audience"];

        var effectiveSalonId = viewingSalonId ?? user.SalonId;

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub,        user.Id.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, user.UserName),
            new(JwtRegisteredClaimNames.Email,      user.Email),
            new(JwtRegisteredClaimNames.Jti,        Guid.NewGuid().ToString()),
            new(ClaimTypes.Name,                    user.FullName),
            new("salonId",                          effectiveSalonId.ToString()),
            new("homeSalonId",                      user.SalonId.ToString()),
        };

        if (user.Role?.Name is not null)
            claims.Add(new Claim(ClaimTypes.Role, user.Role.Name));

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer:            issuer,
            audience:          audience,
            claims:            claims,
            expires:           GetExpiryUtc(),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string CreateKioskToken(Guid salonId, Guid kioskCodeId, string? label)
    {
        var key      = _configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT key missing.");
        var issuer   = _configuration["Jwt:Issuer"];
        var audience = _configuration["Jwt:Audience"];

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new("salonId",                   salonId.ToString()),
            new("kioskCodeId",               kioskCodeId.ToString()),
            new(ClaimTypes.Role,             "Kiosk"),
        };
        if (!string.IsNullOrWhiteSpace(label))
            claims.Add(new Claim("kioskLabel", label));

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer:             issuer,
            audience:           audience,
            claims:             claims,
            expires:            DateTime.UtcNow.AddDays(7),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public DateTime GetExpiryUtc()
    {
        var minutesText = _configuration["Jwt:ExpireMinutes"] ?? "120";
        var minutes     = int.TryParse(minutesText, out var parsed) ? parsed : 120;
        return DateTime.UtcNow.AddMinutes(minutes);
    }
}
